import { deleteAllData } from '@/data';

/** "Delete all my data", then reload on a blank application. */
export async function deleteEverything(): Promise<void> {
  await deleteAllData();
  window.location.replace(window.location.pathname);
}
