// Discord Markdown Parser
// Converts Discord markdown to HTML

function parseDiscordMarkdown(text) {
  if (!text) return '';
  
  let html = text;
  
  // Escape HTML first
  html = escapeHtml(html);
  
  // Bold text: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic text: *text* or _text_
  html = html.replace(/(?<!\*)\*(?!\*)([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)([^_]+?)_(?!_)/g, '<em>$1</em>');
  
  // Strikethrough: ~~text~~
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
  
  // Underline: __text__ (only if not already bold)
  html = html.replace(/(?<!__)__(?!_)([^_]+?)__(?!_)/g, '<u>$1</u>');
  
  // Code blocks: ```code```
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code: `code`
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  
  // Spoiler: ||text||
  html = html.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
  
  // Headers: # Header, ## Header, ### Header
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // Blockquotes: > text
  html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
  
  // Lists: - item or * item
  html = html.replace(/^[\s]*[-*] (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Numbered lists: 1. item
  html = html.replace(/^[\s]*\d+\. (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
  
  // URLs: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Plain URLs: http://example.com
  html = html.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add CSS for spoilers
function addSpoilerStyles() {
  if (document.getElementById('discord-markdown-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'discord-markdown-styles';
  style.textContent = `
    .spoiler {
      background-color: #4f545c;
      color: #4f545c;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.1s ease;
      user-select: none;
    }
    
    .spoiler:hover {
      background-color: #5f646c;
    }
    
    .spoiler.revealed {
      background-color: transparent;
      color: inherit;
      cursor: default;
    }
    
    /* Discord-style code blocks */
    pre {
      background-color: #2f3136;
      border-radius: 4px;
      padding: 12px;
      margin: 8px 0;
      overflow-x: auto;
    }
    
    code {
      background-color: #2f3136;
      border-radius: 3px;
      padding: 2px 4px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
    }
    
    /* Blockquotes */
    blockquote {
      border-left: 4px solid #4f545c;
      margin: 8px 0;
      padding-left: 12px;
      color: #dcddde;
    }
    
    /* Lists */
    ul, ol {
      margin: 8px 0;
      padding-left: 20px;
    }
    
    li {
      margin: 4px 0;
    }
    
    /* Headers */
    h1, h2, h3 {
      margin: 16px 0 8px 0;
      color: #ffffff;
    }
    
    h1 { font-size: 1.5em; }
    h2 { font-size: 1.3em; }
    h3 { font-size: 1.1em; }
    
    /* Links */
    a {
      color: #00b0f4;
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
  `;
  
  document.head.appendChild(style);
}

module.exports = {
  parseDiscordMarkdown,
  escapeHtml,
  addSpoilerStyles
};
