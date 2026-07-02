-- Editable copy for public-facing pages (/sms-terms, /join). Key/content
-- store; if a key isn't present, the code falls back to a hardcoded
-- default so the pages always render.

CREATE TABLE `page_templates` (
  `key` text PRIMARY KEY NOT NULL,
  `content` text NOT NULL,
  `updated_at` text NOT NULL
);
