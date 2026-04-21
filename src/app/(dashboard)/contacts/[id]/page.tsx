'use client';

import { useRouter, useParams } from 'next/navigation';
import { ContactDetail } from '@/components/contacts/ContactDetail';

export default function ContactRecordPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const contactId = String(params.id ?? '');

  return (
    <ContactDetail
      contactId={contactId}
      open
      onClose={() => router.push('/contacts')}
      onDeleted={() => router.push('/contacts')}
    />
  );
}
