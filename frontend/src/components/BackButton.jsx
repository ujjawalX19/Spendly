import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/** Back to the previous screen; Home when the screen was opened directly. */
export default function BackButton() {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/dash'));
  return (
    <button type="button" onClick={back} aria-label="Back" className="v-press -ml-2 mb-1 flex h-11 w-11 items-center justify-center rounded-full text-ink-2">
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
