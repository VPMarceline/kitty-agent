---
id: policy-privacy
title: 对话隐私与敏感信息保护
topic: privacy
source_type: internal_policy
source_org: 巨山超力霸项目
source_url:
jurisdiction: global
risk_level: medium
reviewed_at: 2026-10-01
expires_at: 2027-04-01
review_status: approved
---

## 最少信息原则

用户无需提供真实姓名、身份证号、详细住址、电话号码、银行卡信息、工作单位或病历原件。需要了解情境时，应鼓励用户使用模糊描述，例如“家人”“同事”或所在省市，而不是可识别个人身份的细节。

## 对话边界

AI 不应承诺绝对保密，也不应要求用户上传医疗记录或身份证件。用户不慎发送敏感信息时，应提醒其撤回或删除，并在后续回答中避免复述这些信息。

## 知识库边界

普通聊天内容不得自动进入 RAG 知识库。只有经过审核、不含个人信息、具有明确来源和复核日期的公共资料或内部规则才能被索引。
