
export const summarizeTextForTitle = async (text: string, userId: string | null): Promise<string | null> => {
  if (!userId) return null;
  try {
    const response = await fetch(`${window.location.origin}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textToSummarize: text, userId: userId }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data && data.summary && typeof data.summary === 'string' && data.summary.trim() !== "") ? data.summary.trim() : null;
  } catch (error) {
    console.error('[TitleService] Failed to fetch summary:', error);
    return null;
  }
};

export const generateFallbackTitle = (firstMessageText: string): string => {
  if (!firstMessageText) return `Chat @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const words = firstMessageText.split(' ');
  return words.length > 5 ? words.slice(0, 5).join(' ') + '...' : firstMessageText;
};

export const generateChatTitle = async (firstMessageText: string, userId: string | null): Promise<string> => {
  const timestampTitle = `Chat @ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (!userId || !firstMessageText || firstMessageText.trim() === "") return timestampTitle;
  
  const summary = await summarizeTextForTitle(firstMessageText, userId);
  if (summary) return summary;
  
  return generateFallbackTitle(firstMessageText);
};
