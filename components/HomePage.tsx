'use client';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, FlaskConical, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { BrandMark } from '@/components/BrandMark';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/lib/server/auth';

const ROLE_LABELS: Record<AppRole, string> = {
  ACCOUNTANT: 'Kế toán viên (nhập hóa đơn)',
  CHIEF_ACCOUNTANT: 'Kế toán trưởng (duyệt < 200 triệu)',
  CFO: 'Giám đốc tài chính (duyệt ≥ 200 triệu)'
};

export default function HomePage():ReactElement {
  const router=useRouter();
  const [busy,setBusy]=useState(true);
  const [role,setRole]=useState<AppRole>('ACCOUNTANT');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [signedIn,setSignedIn]=useState<{displayName:string;role:AppRole}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/auth/me',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      // Đã có phiên: không tự chuyển trang (giám khảo vẫn thấy nút Verify), chỉ hiện nút quay lại workspace.
      if(response.ok){const data=await response.json();if(data.user)setSignedIn({displayName:data.user.displayName,role:data.user.role});return;}
      if(response.status!==401)throw new Error('Không thể kết nối máy chủ.');
      if(new URLSearchParams(window.location.search).get('expired'))toast.info('Phiên đã kết thúc. Hãy mở lại demo.');
    }).catch(()=>{if(!controller.signal.aborted)toast.error('Không thể kết nối máy chủ.');}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[router]);
  async function enter(path:'/api/demo/session'|'/api/auth/login',body:Record<string,string>):Promise<void> {
    if(busy)return;setBusy(true);
    try {
      const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok){const data=await response.json();throw new Error(data.error || 'Không thể đăng nhập.');}
      router.replace('/workspace/inbox');
    } catch(error){toast.error(error instanceof Error?error.message:'Không thể đăng nhập.');setBusy(false);}
  }
  return <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
    <section className="w-full max-w-lg space-y-7">
      <div>
        <div className="flex items-center gap-3"><BrandMark size={44}/><h1 className="text-3xl font-semibold tracking-tight">Tax Referee</h1></div>
        <p className="mt-4 text-base text-muted-foreground">Tự xử lý hóa đơn đầu vào thường quy. Dừng đúng lúc và hỏi đúng người khi hóa đơn có nghi vấn, ngoài quy định hoặc vượt thẩm quyền.</p>
      </div>
      <p className="rounded-xl border border-lime-300 bg-lime-50 px-4 py-3 text-sm leading-6 text-foreground" data-testid="judge-instruction">
        <strong>Giám khảo:</strong> bấm <strong>①</strong> để chạy 9 ca kiểm chứng có dấu thời gian, sau đó <strong>②</strong> để tự nhập hóa đơn mới. Không cần tài khoản.
      </p>
      {signedIn&&<Link href="/workspace/inbox" data-testid="continue-workspace" className={cn(buttonVariants({variant:'secondary'}),'h-auto min-h-12 w-full justify-between gap-2 whitespace-normal py-2 text-left')}>
        <span>Tiếp tục vào workspace · {signedIn.displayName} ({ROLE_LABELS[signedIn.role]?.split(' (')[0] || signedIn.role})</span><ArrowRight className="h-4 w-4"/>
      </Link>}
      <div className="grid gap-3">
        <Link href="/verify" className={cn(buttonVariants({size:'lg'}),'h-auto min-h-14 justify-between gap-2 whitespace-normal py-3 text-left text-base')}>
          <span className="flex items-center gap-2"><FlaskConical className="h-5 w-5"/>① Chạy Verify (90 giây)</span><ArrowRight className="h-4 w-4"/>
        </Link>
        <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void enter('/api/demo/session',{role});}}>
          <Button type="submit" size="lg" variant="outline" disabled={busy} className="h-auto min-h-14 w-full justify-between gap-2 whitespace-normal py-3 text-left text-base">
            <span className="flex items-center gap-2"><Inbox className="h-5 w-5"/>{busy?'Đang mở…':'② Mở hộp chuyển tiếp — demo riêng'}</span><ArrowRight className="h-4 w-4"/>
          </Button>
          <label htmlFor="demo-role" className="block text-xs font-medium text-muted-foreground">Vào với vai trò mô phỏng (đổi được trong workspace)</label>
          <select id="demo-role" value={role} onChange={event=>{const value=event.target.value;if(value==='ACCOUNTANT'||value==='CHIEF_ACCOUNTANT'||value==='CFO')setRole(value);}} className="h-10 w-full rounded-[10px] border bg-transparent px-3 text-sm">
            {(Object.keys(ROLE_LABELS) as AppRole[]).map(value=><option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
          </select>
          <p className="text-xs leading-5 text-muted-foreground">Mỗi phiên demo có database riêng, dữ liệu tổng hợp; vai trò là mô phỏng, không phải người dùng thật.</p>
        </form>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="flex flex-wrap gap-4"><Link href="/sop" className="font-medium underline underline-offset-4">Tài liệu quy định (SOP) →</Link><Link href="/trust" className="font-medium underline underline-offset-4">Trung tâm tin cậy (bảo mật) →</Link><Link href="/privacy" className="font-medium underline underline-offset-4">Dữ liệu của bạn đi đâu →</Link></span>
        <details className="text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Đăng nhập nội bộ</summary>
          <form className="mt-3 grid gap-2" onSubmit={(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void enter('/api/auth/login',{email,password});}}>
            <input aria-label="Email" type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} placeholder="email" className="h-9 rounded-[10px] border bg-transparent px-3 text-sm"/>
            <input aria-label="Mật khẩu" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="mật khẩu" className="h-9 rounded-[10px] border bg-transparent px-3 text-sm"/>
            <Button type="submit" size="sm" variant="secondary" disabled={busy}>Đăng nhập</Button>
          </form>
        </details>
      </div>
    </section>
  </main>;
}
