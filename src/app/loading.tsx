import { PageLoading } from '../components/page-loading/page-loading';

// Each page reads the database at request time, so it needs a Suspense
// boundary of its own for instant navigation (Cache Components).
export default PageLoading;
