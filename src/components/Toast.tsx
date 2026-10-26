import { useEffect, useState } from 'react';

/** 짧은 안내. 사라질 때 글자가 비지 않게 마지막 문구를 들고 있다가 서서히 투명해진다 */
export function Toast({ message }: { message: string | null }) {
  const [text, setText] = useState(message);
  useEffect(() => { if (message) setText(message); }, [message]);
  return <div className={`toast${message ? ' show' : ''}`} role="status" aria-hidden={!message}>{text}</div>;
}
