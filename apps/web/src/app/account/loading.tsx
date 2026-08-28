import { LoadingState } from '../../components/ui/status';
import styles from '../../features/auth/auth.module.css';

export default function AccountLoading() {
  return (
    <div className={styles.screen}>
      <section
        aria-labelledby="account-loading"
        className={styles.protectedPanel}
      >
        <LoadingState title="Loading your account">
          Checking your private account information.
        </LoadingState>
      </section>
    </div>
  );
}
