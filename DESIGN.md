# Fieldwork visual system

## Direction

A straightforward invoice tracker for independent work. Client names, amounts, due dates, and the next available action take priority. The ink navigation and cobalt actions identify the application; the document preview looks like the invoice a client would receive.

The balance summary is compact and uses the same visual language as the register. Avoid oversized metric tiles, slogans, decorative punctuation, uppercase eyebrows, ornamental marks, or panels that do not group a specific task.

## Colors

| Token | Value | Purpose |
|---|---|---|
| Ink | `#172237` | Primary text |
| Rail | `#121B2E` | Desktop navigation |
| Cobalt | `#254BE7` | Primary actions, outstanding amount, selection, invoice rule |
| Canvas | `#F4F6FA` | Application background |
| Paper | `#FFFFFF` | Ledger and printable invoice |
| Line | `#E0E5EF` | Rows and section dividers |
| Muted | `#5E6B80` | Supporting information |

Green, coral, and gray identify paid, overdue, and inactive statuses. Always pair the color with a written status. The summary contains actual invoice totals; no decorative charts or implied trends are added.

## Typography

Space Grotesk is used for the app name, headings, and numbers. Manrope carries the controls and working copy. Source Serif appears in the invoice sender's name. Fonts are self-hosted at `/assets/SpaceGrotesk-Variable.woff2`, `/assets/Manrope-Variable.woff2`, and `/assets/SourceSerif4-Variable.woff`.

Normal application text is 14–16px. Supporting metadata, status labels, dates, and footer text use 12px where practical. Client names and financial amounts are easier to scan than invoice identifiers. The document preview uses 13–14px body text on wider screens and 12–13px on phones; print has its own larger page layout. Mobile editing inputs use 16px.

## Layout and behavior

- Desktop: an ink navigation rail, compact page heading and balance summary, a client register, and the selected invoice beside it.
- Tablet: a horizontal masthead preserves readable labels instead of reducing the rail to icons. The register and detail view stack below 850px.
- Phone: a compact 2×2 balance summary, clear client and amount rows, and separate invoice-number and due-date lines. The next action appears before the paper invoice.
- Actions: mark sent, record payment, and void controls are placed directly below the selected invoice's heading. Confirmation stays with the action. Status explanations use direct, factual copy.
- Drafts: field groups are named Invoice details, From, Bill to, Line items, and Notes. The composer retains its visible refresh control after an unconfirmed save. Reopening Create invoice returns to the existing draft. Successful draft saves move keyboard focus to the refreshed invoice after controls unlock; cancel returns to the opening control.
- Print: only the selected invoice remains. Root backgrounds are white; the application, action controls, and summary are hidden. The fictional-sample notice remains on the invoice.
- Without JavaScript: `no-script.css` hides inert loading controls and shows a plain explanation with readable copy. Real demo navigation remains available.
- Reduced motion: animations and transitions are disabled when requested.

## Preservation and QA

Keep the raw record collection, schema/auth/transition metadata, cents arithmetic, ETags, and uncertain-save recovery intact when changing presentation. All ten invoice regression tests passed after the September 6 refinement. Browser review must include desktop, phone, composer, error recovery, no-JavaScript, and print views. Local preview evidence does not establish live Pagelove authorization or constraint enforcement.
