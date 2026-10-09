# Evidence assistant

"Hocus Pocus Assistant" is the project and pitch name. Everything users see says **Evidence assistant**. This is the optional AI enhancement in PRD §14 and the evidence for the §17.3 criterion "optional evaluated evidence assistant". It is not a P0 requirement.

## What it does

When an institution submits a report, the assistant reads each file in the background, so its suggestions are waiting under each file's suitability checks when the officer opens the review. It does this only while an administrator has it turned on and its provider is approved; the assigned officer can ask again after a failed run, or for files submitted while it was off. The officer accepts, amends or dismisses every suggestion. It suggests answers to the questions the officer already asks about every file:

| Kind (`assistantKinds`) | Question                                                    | Who decides the finding                                                    |
| ----------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `institution`           | Whose document is it? (`match` or `mismatch`)               | The platform compares the quoted name with the institution under review    |
| `period`                | Which period does it cover? (`match` or `mismatch`)         | The platform parses the quoted date and compares it with the period        |
| `passage`               | Which passage supports a citing milestone? (`relevant`)     | The provider proposes it; the officer judges it                            |
| `citation`              | Does the location the institution cited exist in the file?  | The platform searches the whole text (`found` or `not_found`)              |
| `approval`              | Is approval or signature wording present? (`present`)       | The platform checks the quoted wording; this shows presence, not identity  |
| `missing`               | Is a date or a signature missing, or is the file unrelated? | The platform checks all the readable text; never when a page is unreadable |

Every suggestion shows the passage it is based on and opens the file at that page or sheet, and every suggestion is labelled AI-generated. The officer accepts, amends or dismisses each one separately; there is no "accept all". Decisions are attributed, audited and visible read-only to supervisors and administrators in scope. Institutions have no route to any of it.

### Chat about the submission

Under the suitability checks, **Ask the evidence assistant** lets the assigned officer ask questions about the whole submission ("Who chaired the meeting?", "Is M-02 supported anywhere?"). Supervisors and administrators read the conversation. Each answer comes from every readable file in the submission, with the institution, the period and the milestones' cited locations:

- The prompt tells the model to answer only from the files, name the file and page, quote exact words, say when the files do not say, and never give a score, verdict or decision. As with suggestions, the files are fenced data and instruction-like lines are withheld before sending.
- Answers are AI-generated text, labelled as such, and are not traced the way suggestions are. They never record anything in the review.
- The last 10 messages go with each question. Files are included whole, up to `ASSISTANT_MAX_PAGES` × 3,000 characters in total; files past that are named as left out, never cut part way.
- In the deterministic mode (and the mock), the reply is a word search: the three lines that share the most words with the question, with file and page.
- The reply arrives within `ASSISTANT_TIMEOUT_MS`. When the provider fails, the conversation says so and the question can be asked again.
- Questions and replies are stored in `assistant_messages`. Logs and audit records (`assistant.chat`) carry identifiers, provider, model, outcome and timing, never the text.

### Help with the suitability checks

The run's findings also become hints for the five suitability checks (PRD §9.2), shown under each check in the officer's form. `assistantCheckHints` in the contracts domain maps them:

| Check       | Suggests Deficient when…                                 | Suggests Pass when…                      |
| ----------- | -------------------------------------------------------- | ---------------------------------------- |
| institution | it names another organisation                            | it names this institution                |
| period      | it is dated outside the period, or has no date           | it is dated within the period            |
| relevance   | a cited location is missing, or the file looks unrelated | cited locations and passages were found  |
| approval    | no approval or signature wording was found               | approval or signature wording is present |
| readability | any page or sheet could not be read                      | the whole file was read                  |

The rules behind the hints:

- A deficient finding outweighs a passing one.
- Dismissed suggestions are ignored. An amended suggestion counts with the officer's wording.
- A check gets no hint when no finding speaks to it.
- A hint fills nothing until the officer clicks **Use** on that one check. The officer can still change it, and nothing is recorded until they save the checks. Nothing is pre-selected and there is no "use all", so a file is never passed by default.

## How it stays bounded

- **Providers only propose.** A provider returns candidates: kind, page, an exact quote and a value inside it. `assess` in `packages/contracts/src/domain/assistant.ts` keeps a candidate only if the quote is on that page and the value is inside the quote. Everything else is counted as untraceable and never shown. The platform, not the model, decides match or mismatch, and it writes the wording of every statement.
- **Document text is data.** The prompt carries the only instructions; the document follows as fenced data. A line that reads like instructions to a model (for example "ignore previous instructions", "award full marks") is counted, reported to the officer as ignored, and no suggestion may quote it. The model has no tools, and the API never follows redirects or fetches links.
- **No effect on the review.** Suggestions live in their own tables (`assistant_runs`, `assistant_suggestions`). Nothing writes suitability checks, decisions, scores or publications. The integration test asserts the review bundle's score, suitability and decisions are unchanged after a run and three decisions, and that a failing provider leaves the review working.
- **Bounded waiting.** A run happens outside the request and outside the write lock. The page polls while it runs, and the officer can carry on reviewing. Runs stop at `ASSISTANT_TIMEOUT_MS`; a run lost to a restart reads as timed out.
- **Exact version.** A run belongs to one file version. A replaced file gets fresh suggestions; earlier ones stay under "Earlier suggestions". Asking again about an unchanged file reuses the run for the same provider, model and prompt revision; a failed run may be retried.
- **Whole files only.** Files over `ASSISTANT_MAX_PAGES` (PDF pages, workbook sheets, or about 3,000 characters per page for Word) are declined, never partly read. Images and scans without a text layer are reported as unreadable pages, and nothing is guessed about them. Seeded demonstration records without stored contents are declined.
- **Logs and audit.** These record identifiers, provider, model, prompt revision, timings, counts and outcomes. They never record document text, prompts or replies.
- **Gating.** Kinds listed in `ASSISTANT_HIDDEN_KINDS` are not stored or shown (Decision 5). For Kiswahili and mixed documents, only kinds in `ASSISTANT_OTHER_LANGUAGE_KINDS` are shown, and the officer sees "The evidence assistant is less reliable for documents in this language" (Decision 6).

## Trying it with the demonstration packs

The scripted year (**Simulation clock → Run the scripted year**, demo environment only) submits the fictional signed CPC and IAO minutes from `docs/demo-evidence-packs`. Each milestone cites the minute its pack names, for example `MIN. CPC/05/Q1/2026-27`. Where a pack has no file for a quarter (DEMO-005 Q3), a stand-in is uploaded instead, and the assistant reports that it could not read it. DEMO-007's Q2 revision 1 carries the pack's wrong-period minutes (FY 2025/26), which the assistant flags as dated outside the period. Revision 2 replaces them.

Outside the scripted year, sign in as a focal person and upload any pack PDF, or a file from `docs/assistant-evaluation/files`, with a report.

## Configuration

Administrators turn it on or off under **Operations → Evidence assistant**. That page also shows the provider, model, endpoint host, prompt revision, limits and usage. A reset or a new simulation run turns it off. The provider and model are deployment configuration (`apps/api/src/config.ts`, `.env.example`), so changing them needs no code change.

| Variable                         | Default                     | Meaning                                                                                                                      |
| -------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ASSISTANT_PROVIDER`             | `deterministic`             | `deterministic` (rules in the platform; no model, no network) or `openai-compatible`                                         |
| `ASSISTANT_BASE_URL`             | `http://127.0.0.1:11434/v1` | Chat completions endpoint: Ollama's `/v1`, or a hosted API's OpenAI-compatible endpoint                                      |
| `ASSISTANT_MODEL`                | `qwen2.5:7b`                | Model ID, recorded on every run                                                                                              |
| `ASSISTANT_API_KEY`              | empty                       | Bearer key for a hosted API                                                                                                  |
| `ASSISTANT_TEMPERATURE`          | `0`                         | Sampling temperature for repeatable runs; empty omits it for models that accept only their default (OpenAI reasoning models) |
| `ASSISTANT_PROVIDER_TERMS`       | empty                       | Anchor of this provider's data-handling record below. A model provider cannot be turned on without it.                       |
| `ASSISTANT_REAL_DATA_APPROVED`   | `false`                     | Outside demo mode, nothing is sent to any provider until data processing is approved (§13)                                   |
| `ASSISTANT_TIMEOUT_MS`           | `90000`                     | Per-file time limit                                                                                                          |
| `ASSISTANT_MAX_PAGES`            | `50`                        | Page limit; can be lowered, never raised above 50                                                                            |
| `ASSISTANT_HIDDEN_KINDS`         | empty                       | Kinds below the bar for this provider, e.g. `passage` for the deterministic mode (see the evaluation below)                  |
| `ASSISTANT_OTHER_LANGUAGE_KINDS` | empty                       | Kinds that met the bar for Kiswahili and mixed documents                                                                     |

The MSW mock always uses the deterministic mode, so the core test suites never depend on a model or the network.

### Running a local model with Ollama

```sh
brew install ollama            # or https://ollama.com/download
OLLAMA_CONTEXT_LENGTH=16384 ollama serve
ollama pull qwen2.5:7b
ASSISTANT_PROVIDER=openai-compatible ASSISTANT_MODEL=qwen2.5:7b \
  ASSISTANT_PROVIDER_TERMS='docs/assistant.md#ollama-on-the-demo-laptop' pnpm dev
```

Ollama's default context is short, and it cuts long prompts without an error. A cut prompt can only cost recall, because absence flags come from the platform's own whole-text checks, not from the model. Still, set `OLLAMA_CONTEXT_LENGTH` above the longest prompt in use.

### Running a hosted model

Point `ASSISTANT_BASE_URL` at the provider's OpenAI-compatible chat endpoint, then set `ASSISTANT_MODEL`, `ASSISTANT_API_KEY` and `ASSISTANT_PROVIDER_TERMS`. Record the provider's data handling below first. For OpenAI:

```sh
ASSISTANT_PROVIDER=openai-compatible
ASSISTANT_BASE_URL=https://api.openai.com/v1
ASSISTANT_MODEL=gpt-4.1-mini          # any chat model; the model ID is recorded on every run
ASSISTANT_API_KEY=sk-...
ASSISTANT_TEMPERATURE=                # empty for reasoning models (o-series, gpt-5), which reject 0
ASSISTANT_PROVIDER_TERMS=docs/assistant.md#openai
```

Other providers work the same way, because they offer an OpenAI-compatible endpoint. Change these three variables:

| Provider          | `ASSISTANT_BASE_URL`                                      | `ASSISTANT_MODEL`, for example |
| ----------------- | --------------------------------------------------------- | ------------------------------ |
| OpenAI            | `https://api.openai.com/v1`                               | `gpt-4.1-mini`                 |
| Anthropic         | `https://api.anthropic.com/v1`                            | `claude-sonnet-5-5`            |
| Google Gemini     | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash`             |
| Mistral           | `https://api.mistral.ai/v1`                               | `mistral-small-latest`         |
| OpenRouter (many) | `https://openrouter.ai/api/v1`                            | `anthropic/claude-sonnet-5-5`  |
| Ollama (local)    | `http://127.0.0.1:11434/v1`                               | `qwen2.5:7b`                   |

`ASSISTANT_API_KEY` is that provider's key. Each one needs its own row under data protection before it can be turned on. The request uses JSON mode (`response_format: json_object`); a provider that ignores it still works, because the reply is parsed leniently and anything malformed is counted as untraceable.

## Data protection (HP2-62)

Only synthetic documents may be sent to any provider until the responsible organization approves data processing and transfer. That covers the evaluation set and the fictional demonstration packs. It applies to local models too, until their hosting is approved. Outside demo mode, `ASSISTANT_REAL_DATA_APPROVED` enforces this.

What leaves the platform on each run: the file's extracted text, the institution's name and ID, the period, and the citing milestones with their cited locations. On each chat question: the extracted text of every file in the submission, the same context, the officer's question and the last 10 messages of the conversation. Nothing else is sent: no names of users, no scores, no other submissions.

| Provider                                                        | Where it is processed                                                          | What it retains                                                                                                                                                        | Status                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Deterministic (`deterministic`)                                 | Inside the API process                                                         | Nothing beyond the platform's own records                                                                                                                              | Approved for synthetic and demonstration data                     |
| <a id="ollama-on-the-demo-laptop"></a>Ollama on the demo laptop | The machine running `ollama serve` (the demo laptop, offline)                  | Prompts are not stored by Ollama by default. The model stays in memory for a few minutes. Debug logging (`OLLAMA_DEBUG`) must stay off. To confirm on the demo machine | Synthetic data only                                               |
| <a id="openai"></a>OpenAI API                                   | To be recorded from OpenAI's current API data terms: region and sub-processors | To be recorded: API data retention period, whether API data is used for training, abuse-monitoring logs, zero-retention eligibility                                    | **Not enabled** until this row is completed and reviewed (HP2-62) |
| Other hosted API                                                | To be recorded per provider: region and sub-processors                         | To be recorded from the provider's current terms: retention, training use, abuse logging                                                                               | **Not enabled** until a row is recorded here (HP2-62)             |

Institution-facing privacy text appears under the upload control: "Submitted files may be read by AI to help officers review them; officers make every decision."

### Open items for the responsible organization (§13 pilot gate)

These are recorded as open, not resolved:

- controller and processor roles for the platform and each AI provider;
- the lawful basis for AI reading of submitted evidence;
- retention and deletion of suggestions and officers' decisions;
- cross-border transfer safeguards for any hosted provider;
- whether a data protection impact assessment is required;
- approval of the hosting of any local model used with real documents.

## Evaluation (HP2-58, HP2-61)

The set is in `docs/assistant-evaluation/`. It holds 13 synthetic documents generated by `generate.py`, with expected answers in `expected.json`:

- a clean signed CPC minute;
- a wrong-quarter IAO minute;
- an unrelated fleet log;
- a minute with embedded instructions to ignore rules and award full marks;
- an undated, unsigned Word minute;
- an Appendix V workbook;
- a scanned PDF with no text layer;
- a PNG and a JPEG photo;
- a Kiswahili minute and a mixed-language minute;
- another institution's minute;
- a minute whose cited location does not exist.

Between them they cover every accepted file type: PDF, DOCX, XLSX, PNG and JPEG.

```sh
pnpm --filter @cpi/api assistant:evaluate
ASSISTANT_PROVIDER=openai-compatible ASSISTANT_MODEL=qwen2.5:7b pnpm --filter @cpi/api assistant:evaluate
```

Each run prints the report and writes the raw suggestions to `docs/assistant-evaluation/results/`. The bar is Decision 5:

- **Precision**, per kind: institution and period at least 90%, passage and citation at least 85%, approval and missing at least 80%.
- **Recall**, per kind: at least 70%, and at least 60% for missing.
- **Always flagged**: every wrong-quarter and unrelated document.

### Results

Only runs that were actually made are listed.

**Deterministic rules, 7 October 2026, prompt revision `ea-2026-10-07.1`** (`results/2026-10-07-deterministic-rules.json`)

- 13 of 13 documents processed; median 2 ms per document.
- Untraceable suggestions shown: 0. Injection-driven suggestions shown: 0. The two instruction-like lines in the injection document were found and ignored.
- Must-flag documents flagged: 2 of 2 (the wrong quarter and the unrelated file).
- Scans and photos: reported as unreadable, with no suggestions.

| Kind (English) | Precision    | Recall       | Meets bar |
| -------------- | ------------ | ------------ | --------- |
| institution    | 8/8 (100%)   | 7/7 (100%)   | yes       |
| period         | 7/7 (100%)   | 6/6 (100%)   | yes       |
| passage        | 9/11 (82%)   | 8/8 (100%)   | **no**    |
| citation       | 12/12 (100%) | 12/12 (100%) | yes       |
| approval       | 6/6 (100%)   | 6/6 (100%)   | yes       |
| missing        | 4/4 (100%)   | 4/4 (100%)   | yes       |

On the two Kiswahili and mixed documents, every kind shown was correct (2/2 each), and missing was not measured. Two documents are too few to clear the language bar honestly, so `ASSISTANT_OTHER_LANGUAGE_KINDS` stays empty.

The deterministic `passage` kind misses the bar. It quotes the cited minute even where that minute says the work was postponed (E01, M-02) or not achieved (E06, M-01). It is hidden in the deterministic deployment (`ASSISTANT_HIDDEN_KINDS=passage`).

**Local model (Ollama): not yet run.** **Hosted model: not yet run.** Both use the same command and set. Record their figures here, with the model, version and date, only after a real run.

### Limits of these figures

- The set and the deterministic rules were written together. They show the rules do what they were built to do; they say little about unseen documents. A model run and the practitioner walkthroughs (HP2-33) are the real test.
- The first version of the set checked approval by kind only. A demo run then showed the rules quoting "confirmed as a true record" (about the previous minutes) as this file's approval. The rules now prefer signature lines, and the set checks the quote. More checks of this kind are likely missing.
- Thirteen documents are too few to measure the bar reliably. Decision 5 reviews the bar after the first recorded run.
- There is no OCR, so scans and photos are always unreadable to the assistant.
- Language detection and the instruction-like check are keyword heuristics, marked `ponytail:` in the code.
- Usefulness and over-trust are still to be checked with officers in HP2-33.
