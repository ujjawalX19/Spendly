/**
 * "Ask Vittova about this": a small entry point on a screen that opens Vittova
 * AI with a question about what the person is looking at. The answer still
 * comes from the server's calculations; this only chooses the question.
 */
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AskVittova({ question, screen, label = 'Ask Vittova about this' }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/bot', { state: { ask: question, screen } })}
      className="v-press v-block flex min-h-[52px] w-full items-center gap-3 px-4 text-left">
      <MessageCircle className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block truncate text-xs text-ink-3">{question}</span>
      </span>
    </button>
  );
}
