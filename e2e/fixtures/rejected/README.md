# Rejected upload fixtures

Synthetic files the upload checks must refuse (`packages/contracts/src/domain/uploads.ts`). `expected.json` gives the reason for each, and both the contracts unit tests and the API integration tests read it. Each was derived from the accepted fixtures one directory up (`cpc-minutes.docx`, `allocation-register.xlsx`, `notice-board.png`, `minutes.pdf`, `photo.jpg`), changing only what the name says. None contains real content or working code.

| Reason      | Meaning                                                                   | Message starts with                |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------- |
| `damaged`   | Incomplete or not a document of the claimed structure                     | "This file appears to be damaged"  |
| `protected` | Password-protected or encrypted, so it cannot be inspected                | "This file is password-protected"  |
| `active`    | Macros, scripts, launch actions, attached files, OLE objects or ActiveX   | "This file contains macros"        |
| `mismatch`  | The contents are another kind of file (an executable, an Office template) | "The file's contents do not match" |
