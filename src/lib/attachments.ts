export type UploadedDocument = { id: string; name: string; path: string; size: number };

export function documentPrompt(text: string, documents: UploadedDocument[]): string {
  if (!documents.length) return text;
  const references = documents.map((document) => `- ${document.name}: ${document.path}`).join('\n');
  return `${text.trim() || '请查看我上传的这些附件。'}\n\n已上传附件（电脑路径）：\n${references}`;
}
