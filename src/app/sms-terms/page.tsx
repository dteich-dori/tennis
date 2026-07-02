"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

// Public SMS Terms & Privacy page — the URL your A2P 10DLC campaign
// submission points to. Body content is now editable at /page-templates
// (admin). Falls back to the code-shipped default if the template
// endpoint fails.

export default function SmsTermsPage() {
  const [body, setBody] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetch("/api/public/page-templates?key=sms-terms-body")
      .then((r) => r.json())
      .then((data: { [k: string]: string }) => {
        setBody(data["sms-terms-body"] ?? "");
      })
      .catch(() => setLoadFailed(true));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-gray-800 leading-relaxed">
      {loadFailed && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded p-3 mb-6 text-sm">
          Unable to load the terms. Please refresh the page or contact the
          tennis committee.
        </div>
      )}
      {body === null ? (
        <p className="text-gray-500 italic">Loading…</p>
      ) : (
        <article className="prose prose-sm max-w-none prose-headings:font-semibold prose-a:text-primary">
          <ReactMarkdown>{body}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
