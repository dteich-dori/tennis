-- Public signup submissions from /join. Land in "pending" until an
-- admin approves them. The consent snapshot (text + IP + UA) is
-- preserved for A2P 10DLC / carrier audit evidence.

CREATE TABLE `signup_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `first_name` text NOT NULL,
  `last_name` text NOT NULL,
  `cell_number` text,
  `carrier` text,
  `email` text,
  `notes` text,
  `consent_given` integer DEFAULT 1 NOT NULL,
  `consent_text` text NOT NULL,
  `consent_ip` text,
  `consent_user_agent` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` text NOT NULL,
  `reviewed_at` text,
  `reviewed_by` text
);
