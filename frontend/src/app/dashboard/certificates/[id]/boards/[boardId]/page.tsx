'use client';

import { useParams } from 'next/navigation';
import { BoardDetailView } from '../../../components/BoardDetailView';

export default function BoardDetailPage() {
  const params = useParams();
  const boardId = String(params.boardId ?? '');
  return <BoardDetailView boardId={boardId} />;
}
