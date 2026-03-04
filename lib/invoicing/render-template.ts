import Handlebars from "handlebars";

Handlebars.registerHelper("formatNumber", (value: number) => {
  if (value == null) return "";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
});

Handlebars.registerHelper("formatDate", (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
});

export function renderHandlebarsTemplate(
  templateContent: string,
  data: Record<string, unknown>
): string {
  const template = Handlebars.compile(templateContent, {
    noEscape: false,
    strict: false,
  });
  return template(data);
}
