# Review Memory and Prompt Feedback Research

Scope: schema-only research for feeding human review failures back into future
scene prompts. This PR does not write review feedback to DB, R2, files outside
source/docs/tests, or external memory systems.

## Candidate Tools

| Tool | Fit | Use decision |
| --- | --- | --- |
| Mem0 | Memory layer for agent/user feedback. Source: https://github.com/mem0ai/mem0 | Research candidate |
| Dify | Workflow/app platform for LLM operations. Source: https://github.com/langgenius/dify | Research candidate with license review |
| Flowise | Visual workflow builder. Source: https://github.com/FlowiseAI/Flowise | Research candidate |
| LangGraph | Durable agent workflow graph. Source: https://github.com/langchain-ai/langgraph | Good fit for prompt feedback orchestration |
| LlamaIndex | Data/index framework for retrieval. Source: https://github.com/run-llama/llama_index | Useful if review evidence grows |
| n8n | Workflow automation platform. Source: https://github.com/n8n-io/n8n | Useful existing workflow adjacency, license review needed |
| Kestra | Workflow orchestration platform. Source: https://github.com/kestra-io/kestra | Research candidate |
| Windmill | Scripts/workflows platform. Source: https://github.com/windmill-labs/windmill | Research candidate |

## Local Schema

`VideoHumanReviewFeedback` captures:

- safe candidate reference
- reviewer role
- pass/fail/needs revision outcome
- known failed patterns
- prompt feedback text
- created timestamp
- `storageWritesEnabled = false`

Known failed patterns:

- `static product image repeated`
- `color card scene`
- `abstract shape card`
- `unrealistic stick hand`
- `non-photorealistic kitchen`
- `slideshow-like output`
- `caption out of safe area`
- `voice too slow`
- `no real motion clip`
- `product identity drift`

## Prior Video Lessons

The following prior review ids must stay visible in docs/tests so future prompt
changes do not regress into false positives:

- `pLBtNgrwLJA`
- `mLytN-u2C5M`
- `hRq1iap1C14`
- `G-r6rWsZwiU`

These ids are references to human QA lessons only. They are not upload success
claims and do not imply public or unlisted upload readiness.

## Prompt Feedback Use

Prompt generation should convert failed patterns into negative prompts and
required scene constraints. Example:

- `slideshow-like output` -> require moving hand, utensil, liquid/food motion,
  or product rotation in at least four scenes.
- `unrealistic stick hand` -> require cropped realistic hand references and
  block cartoon/vector hands.
- `product identity drift` -> repeat safe product identity cues in every scene
  brief and reject raw URL leakage.
