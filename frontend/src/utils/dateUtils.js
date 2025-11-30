/**
 * Date utility functions for formatting and grouping messages by time period.
 */

export function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // Format as date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatFullTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getTimeGroupKey(isoString, groupBy = 'day') {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  
  switch (groupBy) {
    case 'hour':
      return date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    case 'day':
      return date.toISOString().slice(0, 10); // YYYY-MM-DD
    case 'week':
      // Get week number (ISO week)
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().slice(0, 10);
    case 'month':
      return date.toISOString().slice(0, 7); // YYYY-MM
    default:
      return date.toISOString().slice(0, 10);
  }
}

export function formatGroupKey(key, groupBy = 'day') {
  if (!key) return 'Unknown';
  const date = new Date(key);
  
  switch (groupBy) {
    case 'hour':
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
      });
    case 'day':
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (date.toDateString() === today.toDateString()) return 'Today';
      if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
      
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
      });
    case 'week':
      const weekStart = new Date(key);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    case 'month':
      return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    default:
      return key;
  }
}

export function groupMessagesByTime(messages, groupBy = 'day') {
  const groups = {};
  
  messages.forEach((msg, index) => {
    const timestamp = msg.created_at || msg.timestamp;
    const key = getTimeGroupKey(timestamp, groupBy);
    
    if (!groups[key]) {
      groups[key] = [];
    }
    
    groups[key].push({ ...msg, _index: index });
  });
  
  // Sort groups by date (newest first)
  const sortedKeys = Object.keys(groups).sort().reverse();
  
  return sortedKeys.map(key => ({
    key,
    label: formatGroupKey(key, groupBy),
    messages: groups[key],
  }));
}

