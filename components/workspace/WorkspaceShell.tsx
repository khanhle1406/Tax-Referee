'use client';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import Link from 'next/link';
import { Inbox, FileText, ClipboardCheck, History, Building2, Landmark, Scale, Bell, BookOpen, ArrowUpRight, Menu, LogOut, PanelLeftClose, PanelLeftOpen, MoreHorizontal, ShieldCheck, LayoutDashboard, Layers, Mail, UserCheck } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { workspaceRoutes, type WorkspaceView } from '@/lib/workspaceNavigation';
import { AutomationSwitch } from './AutomationSwitch';
import type { AppUser, AppRole } from '@/lib/server/auth';

interface WorkspaceShellProps {
  children: ReactNode; view: WorkspaceView; user: AppUser; demo: boolean;
  counts: { pending: number; approvals: number; notifications: number };
  onRoleChange: (role: AppRole) => Promise<void>; onLogout: () => void;
  onReset: () => Promise<void>; resetting: boolean; detail: boolean;
  dirty?:boolean;
}
const primary: WorkspaceView[] = ['dashboard','inbox','receive','batches','channels','approval','history','dossier'];
/** Tổng quan (dashboard) dành cho Kế toán trưởng và CFO. */
const visibleFor = (key: WorkspaceView, role: AppRole): boolean => key !== 'dashboard' || role !== 'ACCOUNTANT';
// Ngoài luồng Đề A: tiện ích mở rộng, một phần dữ liệu/tích hợp là giả lập — tách khỏi đường đi chính của giám khảo.
const tools: WorkspaceView[] = ['suppliers','banking','reconciliation','reports','ledger','notifications'];
const icons: Partial<Record<WorkspaceView, ReactNode>> = { dashboard:<LayoutDashboard />, batches:<Layers />, channels:<Mail />, history:<UserCheck />, inbox:<Inbox />, receive:<FileText />, approval:<ClipboardCheck />, dossier:<History />, suppliers:<Building2 />, banking:<Landmark />, reconciliation:<Scale />, notifications:<Bell />, policy:<BookOpen /> };
const roleNames: Record<AppRole,string> = { ACCOUNTANT:'Kế toán viên', CHIEF_ACCOUNTANT:'Kế toán trưởng', CFO:'CFO' };

export function WorkspaceShell({children,view,user,demo,counts,onRoleChange,onLogout,onReset,resetting,detail,dirty=false}:WorkspaceShellProps):ReactElement {
  const [mobileOpen,setMobileOpen] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  const [changing,setChanging] = useState(false);
  const link = (key:WorkspaceView):ReactElement => {
    const count = key === 'inbox' ? counts.pending : key === 'approval' ? counts.approvals : key === 'notifications' ? counts.notifications : 0;
    return <Link key={key} href={workspaceRoutes[key].path} onClick={()=>setMobileOpen(false)} aria-current={view===key&&!detail?'page':undefined} title={collapsed?workspaceRoutes[key].label:undefined} className={`workspace-nav-link ${view===key&&!detail?'is-active':''}`}>
      <span className="nav-icon" aria-hidden="true">{icons[key] || <ArrowUpRight />}</span>
      <span className={collapsed?'md:sr-only':''}>{workspaceRoutes[key].label}</span>
      {count>0 && <span className={`nav-count ${collapsed?'md:hidden':''}`}>{count}</span>}
    </Link>;
  };
  useEffect(()=>{const media=window.matchMedia('(min-width:768px)');const close=():void=>{if(media.matches)setMobileOpen(false);};media.addEventListener('change',close);return ()=>media.removeEventListener('change',close);},[]);
  const navigation=<>
      <div className="workspace-brand"><Link href="/workspace/inbox" onClick={()=>setMobileOpen(false)} className="flex items-center gap-2.5" aria-label="Tax Referee, về Thẩm định"><BrandMark size={34}/><span className={collapsed?'md:hidden':'font-semibold tracking-tight'}>Tax Referee</span></Link>

      </div>
      <nav aria-label="Điều hướng chính" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {primary.filter(key=>visibleFor(key,user.role)).map(link)}
        <details className="workspace-tools mt-5" open={tools.includes(view)||undefined}><summary title="Mở rộng · beta, một phần giả lập, ngoài phạm vi Đề A">{collapsed?<MoreHorizontal className="h-4 w-4"/>:'Mở rộng · beta (một phần giả lập)'}</summary><div className="mt-2 space-y-1">{tools.map(link)}</div></details>
        <div className="mt-auto space-y-1 pt-6">{link('policy')}<Link href="/verify" onClick={event=>{if(dirty&&!window.confirm('Bản nháp tiếp nhận chưa lưu. Rời workspace?'))event.preventDefault();}} className="workspace-nav-link"><span className="nav-icon"><ClipboardCheck/></span><span className={collapsed?'md:sr-only':''}>Verify</span></Link><Link href="/trust" onClick={event=>{if(dirty&&!window.confirm('Bản nháp tiếp nhận chưa lưu. Rời workspace?'))event.preventDefault();}} className="workspace-nav-link"><span className="nav-icon"><ShieldCheck/></span><span className={collapsed?'md:sr-only':''}>Bảo mật</span></Link></div>
      </nav>
      <div className="flex items-center gap-2 border-t px-3 py-3"><span className={`min-w-0 flex-1 truncate text-xs text-muted-foreground ${collapsed?'md:hidden':''}`}>{roleNames[user.role]}</span><Button size="icon" variant="ghost" aria-label={collapsed?'Mở rộng thanh bên':'Thu gọn thanh bên'} className="hidden md:inline-flex" onClick={()=>setCollapsed(v=>!v)}>{collapsed?<PanelLeftOpen className="h-4 w-4"/>:<PanelLeftClose className="h-4 w-4"/>}</Button></div>
</>;
  return <div className={`workspace-shell ${collapsed?'sidebar-collapsed':''}`}>
    <aside className="workspace-sidebar workspace-sidebar-desktop">{navigation}</aside>
    {/* No exit animation: switching to desktop hides this surface immediately. */}
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}><DialogContent className="workspace-sidebar workspace-sidebar-mobile is-open !animate-none !left-0 !top-0 !h-[100dvh] !w-[min(280px,85vw)] !max-w-none !translate-x-0 !translate-y-0 !rounded-none !p-0 !gap-0"><DialogTitle className="sr-only">Điều hướng Tax Referee</DialogTitle><DialogDescription className="sr-only">Các màn hình nghiệp vụ và công cụ.</DialogDescription>{navigation}</DialogContent></Dialog>
    <div className="workspace-body">
      <header className="workspace-topbar">
        <Button size="icon" variant="ghost" className="md:hidden" aria-label="Mở điều hướng" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}><Menu className="h-5 w-5"/></Button>
        <p className="min-w-0 truncate text-sm text-muted-foreground"><Link href="/workspace/inbox" className="hover:text-foreground">Workspace</Link><span className="mx-2" aria-hidden="true">/</span><span className="text-foreground">{detail?'Hồ sơ':workspaceRoutes[view].label}</span></p>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <AutomationSwitch canControl={user.role!=='ACCOUNTANT'} />
          <span className="workspace-scope" title={demo?'Dữ liệu demo tách riêng':'Dữ liệu nội bộ'}>{demo?'Demo':'Nội bộ'}</span>
          {/* Vai trò mô phỏng chỉ đổi được trong demo riêng; workspace nội bộ hiện vai trò của tài khoản đăng nhập. */}
          {demo?<><label className="sr-only" htmlFor="workspace-role">Vai trò mô phỏng trong demo</label><select id="workspace-role" className="workspace-role" value={user.role} disabled={changing} onChange={async event=>{const role=event.target.value;if(role!=='ACCOUNTANT'&&role!=='CHIEF_ACCOUNTANT'&&role!=='CFO')return;setChanging(true);try{await onRoleChange(role);}finally{setChanging(false);}}}>{Object.entries(roleNames).map(([role,name])=><option key={role} value={role}>{name}</option>)}</select></>:<span className="workspace-role">{roleNames[user.role]}</span>}
          <details className="workspace-account" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label="Tùy chọn tài khoản"><MoreHorizontal className="h-4 w-4"/></summary><div className="workspace-account-menu"><p className="px-3 py-2 text-xs text-muted-foreground">{user.displayName}</p>{demo&&<button type="button" disabled={resetting} onClick={()=>void onReset()} className="text-rose-700">{resetting?'Đang xóa…':'Xóa dữ liệu demo'}</button>}<button type="button" onClick={()=>{if(!dirty||window.confirm('Bản nháp tiếp nhận chưa lưu. Đăng xuất?'))onLogout();}}><LogOut className="h-4 w-4"/>Đăng xuất</button></div></details>
        </div>
      </header>
      {children}
    </div>
  </div>;
}
