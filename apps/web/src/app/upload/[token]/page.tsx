import PublicUploadClient from './PublicUploadClient';

export default async function PublicUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicUploadClient token={token} />;
}
