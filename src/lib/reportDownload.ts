export function downloadMarkdown(text: string, name: string) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\s+/g, '_')}_analysis.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPDF(text: string, name: string) {
  const { marked } = await import('marked');
  const html2pdf = (await import('html2pdf.js')).default;

  const html = await marked.parse(text);
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.padding = '40px';
  container.style.fontFamily = 'system-ui, sans-serif';
  container.style.fontSize = '11px';
  container.style.lineHeight = '1.6';
  container.style.color = '#1a1a2e';
  document.body.appendChild(container);

  await html2pdf()
    .set({
      margin: 10,
      filename: `${name.replace(/\s+/g, '_')}_analysis.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(container)
    .save();

  document.body.removeChild(container);
}
