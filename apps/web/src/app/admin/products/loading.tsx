import { LoadingState } from '../../../components/ui/status';
import { AdminShell } from '../../../features/admin/admin-shell';

export default function AdminProductsLoading() {
  return (
    <AdminShell>
      <LoadingState title="Loading products">
        Loading product management…
      </LoadingState>
    </AdminShell>
  );
}
