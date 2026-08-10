import React, { useState } from "react";
import { supabase } from "./App";
import { Search } from "lucide-react";

export function StudentSearchTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setSearching(true);
    const { data, error } = await supabase
      .from("students")
      .select("*, profiles(full_name, section_assigned)")
      .or(`family_name.ilike.%${searchTerm}%,lrn.ilike.%${searchTerm}%`);

    if (!error && data) setResults(data);
    setSearching(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Search Student Record
        </h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by Family Name or 12-digit LRN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
          >
            Search
          </button>
        </form>
      </div>

      {/* Results Display */}
      {results.length > 0 && (
        <div className="space-y-4">
          {results.map((st) => (
            <div
              key={st.id}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-800">
                    {st.family_name}, {st.first_name} {st.middle_name}
                  </h3>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                    LRN: {st.lrn}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Grade:{" "}
                  <span className="font-semibold">
                    {st.grade_level === 0 ? "Kinder" : st.grade_level}
                  </span>{" "}
                  | Gender: <span className="font-semibold">{st.gender}</span> |
                  Age: <span className="font-semibold">{st.age}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Address: {st.address} | Contact: {st.contact_number}
                </p>
                <p className="text-xs text-slate-500">
                  Parents/Guardian:{" "}
                  {st.father_name || st.mother_name || st.guardian_name}
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-right min-w-[200px]">
                <p className="text-xs text-slate-400 uppercase font-bold">
                  Assigned Adviser
                </p>
                <p className="text-sm font-bold text-blue-900">
                  {st.profiles?.full_name || "Unassigned"}
                </p>
                <p className="text-xs text-slate-500">
                  {st.profiles?.section_assigned
                    ? `Section: ${st.profiles.section_assigned}`
                    : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
