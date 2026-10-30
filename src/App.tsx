import { useStore } from './store';
import { Toolbar, uploadSvg } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { Viewport } from './components/Viewport';
import { GoboStrip } from './components/GoboStrip';

export default function App() {
  const previews = useStore((s) => s.view.previews || s.view.diagnostic);
  return (
    <div
      className="flex h-screen flex-col text-neutral-200"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (file.name.endsWith('.json')) file.text().then((t) => useStore.getState().loadProject(t));
        else uploadSvg(file);
      }}
    >
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Viewport />
          {previews && <GoboStrip />}
        </main>
        <Inspector />
      </div>
    </div>
  );
}
