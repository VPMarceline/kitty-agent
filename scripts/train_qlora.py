import argparse
import json
import random
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    Trainer,
    TrainingArguments,
    set_seed,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Qwen3-4B 心理支持小猫 QLoRA")
    parser.add_argument("--model", required=True)
    parser.add_argument("--train-file", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--max-samples", type=int, default=2000)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--max-steps", type=int, default=50)
    parser.add_argument("--gradient-accumulation", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


class ConversationDataset(Dataset):
    def __init__(self, path, tokenizer, max_samples, max_length, seed):
        examples = []
        with Path(path).open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    record = json.loads(line)
                    messages = record["messages"]
                    # 每个 assistant 回合都是一个独立训练样本。这样既增加有效样本，
                    # 又能从序列尾部保留当前回答，避免长对话截断掉所有监督标签。
                    for message_index, message in enumerate(messages):
                        if message.get("role") == "assistant" and message.get("content", "").strip():
                            examples.append(messages[: message_index + 1])
        random.Random(seed).shuffle(examples)
        self.examples = examples[:max_samples]
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, index):
        messages = self.examples[index]
        prompt_encoding = self.tokenizer.apply_chat_template(
            messages[:-1],
            tokenize=True,
            add_generation_prompt=True,
        )
        full_encoding = self.tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=False,
        )
        # Transformers 5 默认返回 BatchEncoding；兼容旧版直接返回 token 列表。
        prompt_ids = (
            prompt_encoding["input_ids"]
            if hasattr(prompt_encoding, "keys")
            else prompt_encoding
        )
        full_ids_untrimmed = (
            full_encoding["input_ids"]
            if hasattr(full_encoding, "keys")
            else full_encoding
        )

        # 从左侧截断历史，保留序列末尾的当前 assistant 回答。
        left_trim = max(0, len(full_ids_untrimmed) - self.max_length)
        full_ids = full_ids_untrimmed[left_trim:]
        labels = [-100] * len(full_ids)

        # 只训练最后一个 assistant 回答，避免模型学习复述用户或系统消息。
        start = max(0, len(prompt_ids) - left_trim)
        labels[start:] = full_ids[start:]

        if all(label == -100 for label in labels):
            raise ValueError(f"样本 {index} 截断后没有 assistant 标签")

        return {
            "input_ids": torch.tensor(full_ids, dtype=torch.long),
            "attention_mask": torch.ones(len(full_ids), dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }


class DataCollator:
    def __init__(self, pad_token_id):
        self.pad_token_id = pad_token_id

    def __call__(self, features):
        return {
            "input_ids": pad_sequence(
                [item["input_ids"] for item in features],
                batch_first=True,
                padding_value=self.pad_token_id,
            ),
            "attention_mask": pad_sequence(
                [item["attention_mask"] for item in features],
                batch_first=True,
                padding_value=0,
            ),
            "labels": pad_sequence(
                [item["labels"] for item in features],
                batch_first=True,
                padding_value=-100,
            ),
        }


def main():
    args = parse_args()
    set_seed(args.seed)
    if not torch.cuda.is_available():
        raise RuntimeError("没有检测到 CUDA，停止训练以避免误用 CPU。")

    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"CUDA: {torch.version.cuda}")
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        device_map={"": 0},
        quantization_config=BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float16,
        ),
        dtype=torch.float16,
        trust_remote_code=True,
        low_cpu_mem_usage=True,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(
        model,
        use_gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
    )
    model = get_peft_model(
        model,
        LoraConfig(
            r=8,
            lora_alpha=16,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=[
                "q_proj",
                "k_proj",
                "v_proj",
                "o_proj",
                "gate_proj",
                "up_proj",
                "down_proj",
            ],
        ),
    )
    model.print_trainable_parameters()

    dataset = ConversationDataset(
        args.train_file,
        tokenizer,
        args.max_samples,
        args.max_length,
        args.seed,
    )
    print(f"Samples: {len(dataset)}")
    print(f"First sample tokens: {len(dataset[0]['input_ids'])}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(output_dir),
            per_device_train_batch_size=1,
            gradient_accumulation_steps=args.gradient_accumulation,
            max_steps=args.max_steps,
            learning_rate=1e-4,
            warmup_steps=max(1, round(args.max_steps * 0.05)),
            lr_scheduler_type="cosine",
            fp16=True,
            gradient_checkpointing=True,
            optim="paged_adamw_8bit",
            logging_steps=1,
            save_steps=max(1, min(25, args.max_steps)),
            save_total_limit=2,
            report_to="none",
            remove_unused_columns=False,
            dataloader_num_workers=0,
            seed=args.seed,
        ),
        train_dataset=dataset,
        data_collator=DataCollator(tokenizer.pad_token_id),
    )
    result = trainer.train()
    final_dir = output_dir / "adapter-final"
    trainer.save_model(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    trainer.save_metrics("train", result.metrics)
    trainer.save_state()
    print(json.dumps(result.metrics, ensure_ascii=False, indent=2))
    print(f"Adapter: {final_dir}")


if __name__ == "__main__":
    main()
