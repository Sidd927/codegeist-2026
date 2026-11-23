import { EmptyState } from '../../shared/components/States.jsx';
import { copy } from '../../shared/copy/en.js';
import { useRouter } from '../router.jsx';
import { Button } from '../../shared/components/ui.jsx';

export function NotFound() {
  const { navigate } = useRouter();
  return (
    <div className="a25-page">
      <EmptyState headingLevel={1} title={copy.notFound.title} body={copy.notFound.body}>
        <Button onClick={() => navigate('/')}>{copy.notFound.home}</Button>
      </EmptyState>
    </div>
  );
}
