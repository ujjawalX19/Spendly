import { ChatMock } from './Mocks';
import { Split } from './shared';

/** Ask Vittova, as one of the product stories in Features. */
export default function AiSection() {
  return (
    <Split
      id="ai"
      eyebrow="Ask Vittova"
      title="An AI mentor that starts from your numbers."
      body="Ask in plain words. Vittova works out the figures from your own budget, spending and bills first, then explains them. It says when something isn't tracked instead of guessing."
      points={[
        "Figures come from Vittova's own calculations, not the AI's imagination",
        'Your name and email are never sent to the AI',
        'General education: no stock or fund recommendations',
      ]}
    >
      <ChatMock />
    </Split>
  );
}
