import { Suspense } from 'react';
import { getUser } from '@/lib/auth/kinde';
import { redirect } from 'next/navigation';
import { DocumentUploader } from '@/components/document-uploader';
import { DocumentList } from '@/components/document-list';
import { t } from '@/lib/translations/dutch';

export default async function DocumentsPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex flex-1 flex-col space-y-8 p-8">
      <div className="flex items-center space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('documents')}</h2>
          <p className="text-muted-foreground">
            Upload en beheer uw PDF documenten voor intelligente chat
            gesprekken.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <DocumentUploader />
        </div>

        <div className="space-y-6">
          <Suspense fallback={<div>{t('loading')} documenten...</div>}>
            <DocumentList userId={user.id || ''} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
