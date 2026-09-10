const COMMENTAIRES_BLOCK = `{{#if invoice.commentaires}}
<div class="invoice-commentaires" style="margin: 24px 0 16px 0; font-size: 11px; line-height: 1.5; color: #333;">
  <strong style="display: block; margin-bottom: 4px; color: #2c3e50;">Commentaires</strong>
  <p style="margin: 0; white-space: pre-line;">{{invoice.commentaires}}</p>
</div>
{{/if}}
`;

/** Ensure company/DB templates still print comments even if they lack the Handlebars variable. */
export function ensureCommentairesInTemplate(templateContent: string): string {
  if (templateContent.includes("invoice.commentaires")) {
    return templateContent;
  }
  if (templateContent.includes("</body>")) {
    return templateContent.replace("</body>", `${COMMENTAIRES_BLOCK}</body>`);
  }
  return `${templateContent}\n${COMMENTAIRES_BLOCK}`;
}
