import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SearchField } from "@/components/SearchField";
export default function Home() {
  return (<><AppHeader variant="public" search={{ show: false }} /><main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-10"><SearchField variant="hero" autoFocus className="max-w-[680px]" /></main><SiteFooter /></>);
}
