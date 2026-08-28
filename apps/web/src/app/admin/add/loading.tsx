import { LoadingState } from '../../../components/ui/status';
import { AdminShell } from '../../../features/admin/admin-shell';

export default function AdminAddProductLoading() {
  return (
    <AdminShell>
      <LoadingState title="Loading product creation">
        Loading the options required to add a product…
      </LoadingState>
    </AdminShell>
  );
}
