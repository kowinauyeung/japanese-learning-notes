import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { EntryDraft } from '@/types/entry';
import { db } from './firebase';

const COLLECTION = 'entries';

/**
 * createdAt is written once and never included in an update, so the original
 * creation time survives every later edit. Both stamps come from the server
 * rather than the device clock.
 */
export async function createEntry(draft: EntryDraft): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...draft,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEntry(id: string, draft: EntryDraft): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...draft, updatedAt: serverTimestamp() });
}

export async function deleteEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
