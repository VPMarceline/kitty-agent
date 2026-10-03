import argparse
from pathlib import Path

from modelscope import snapshot_download


def parse_args():
    parser = argparse.ArgumentParser(description="Download Qwen3 4B from ModelScope.")
    parser.add_argument("--model-id", default="Qwen/Qwen3-4B")
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    print(snapshot_download(args.model_id, local_dir=str(output_dir)))


if __name__ == "__main__":
    main()
