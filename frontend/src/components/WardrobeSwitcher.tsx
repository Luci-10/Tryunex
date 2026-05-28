import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";

type Accessible = { id: string; ownerId: string; ownerName: string };

// Dropdown at the top of the wardrobe pages: "My wardrobe" + every friend who
// shared theirs. Selecting a friend navigates to /friends/<id>.
export default function WardrobeSwitcher({ current }: { current: "mine" | string }) {
  const nav = useNavigate();
  const [accessible, setAccessible] = useState<Accessible[]>([]);

  useEffect(() => {
    api
      .get<{ shares: Accessible[] }>("/share/i-can-see")
      .then((r) => setAccessible(r.shares))
      .catch(() => setAccessible([]));
  }, []);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === "mine") nav("/");
    else nav(`/friends/${v}`);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3 flex-wrap">
      <label className="text-sm font-medium text-gray-700">Viewing:</label>
      <select
        value={current}
        onChange={onChange}
        className="border rounded-lg px-3 py-2 text-sm min-w-[200px] flex-1"
      >
        <option value="mine">My wardrobe</option>
        {accessible.map((a) => (
          <option key={a.ownerId} value={a.ownerId}>
            {a.ownerName}'s wardrobe
          </option>
        ))}
      </select>
      <Link to="/shared" className="text-sm text-brand-700 hover:underline whitespace-nowrap">
        + Connect to friend
      </Link>
    </div>
  );
}
