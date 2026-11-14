import { getCurrentUser } from "@/auth/session";
import {
  listAssignments,
  listPersons,
  listPositionsOverview,
  listUnits,
} from "@/db/read-models/admin-pimpinan";
import {
  createAssignmentAction,
  createPersonAction,
  endAssignmentAction,
  recordVerificationAction,
} from "./actions";

export const dynamic = "force-dynamic";

const VERIFICATION_LABEL: Record<string, string> = {
  verified: "Terverifikasi",
  needs_verification: "Perlu verifikasi",
  expired: "Kedaluwarsa",
  rejected: "Ditolak",
};
const verLabel = (s: string | null) => VERIFICATION_LABEL[s ?? "needs_verification"];

export default async function AdminHome({
  searchParams,
}: {
  searchParams: { msg?: string; error?: string };
}) {
  // The layout already gates access; re-check so no data is fetched for unprovisioned users.
  const user = await getCurrentUser();
  if (!user?.userId) return null;

  const [positions, assignments, persons, units] = await Promise.all([
    listPositionsOverview(),
    listAssignments(),
    listPersons(),
    listUnits(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {searchParams.msg && (
        <p role="status" className="flash ok">
          {searchParams.msg}
        </p>
      )}
      {searchParams.error && (
        <p role="alert" className="flash error">
          {searchParams.error}
        </p>
      )}

      <h2>Jabatan</h2>
      <p className="muted">
        “Pemegang saat ini” adalah fakta penugasan. “Tampil publik” hanya <strong>Ya</strong> bila
        seluruh rantai (orang, jabatan, unit, penugasan) terverifikasi dan berlaku.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Jabatan</th>
              <th>Unit</th>
              <th>Pemegang saat ini</th>
              <th>Verifikasi penugasan</th>
              <th>Tampil publik</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.position_id}>
                <td>{p.position_title}</td>
                <td>{p.unit_name}</td>
                <td>
                  {p.current_person ?? "—"}
                  {p.current_type && p.current_type !== "definitif" && (
                    <span className="badge">{p.current_type.toUpperCase()}</span>
                  )}
                </td>
                <td>{p.current_assignment_id ? verLabel(p.current_verification) : "—"}</td>
                <td>{p.is_publicly_shown ? "Ya" : "Tidak"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Penugasan</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Orang</th>
              <th>Jabatan</th>
              <th>Jenis</th>
              <th>Mulai</th>
              <th>Berakhir</th>
              <th>Status</th>
              <th>Verifikasi</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td>{a.person_name}</td>
                <td>{a.position_title}</td>
                <td>{a.assignment_type_code}</td>
                <td>{a.start_date}</td>
                <td>{a.end_date ?? "—"}</td>
                <td>{a.assignment_status}</td>
                <td>{verLabel(a.verification)}</td>
                <td>
                  {a.assignment_status === "active" && (
                    <form action={endAssignmentAction} className="inline">
                      <input type="hidden" name="assignment_id" value={a.id} />
                      <input
                        type="date"
                        name="end_date"
                        defaultValue={today}
                        aria-label={`Tanggal berakhir ${a.person_name}`}
                        required
                      />
                      <button type="submit">Akhiri</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Kelola data</h2>

      <details>
        <summary>Tambah orang</summary>
        <form action={createPersonAction} className="form">
          <label>
            Nama lengkap
            <input name="full_name" required maxLength={200} />
          </label>
          <label>
            Nama tampilan (opsional)
            <input name="display_name" maxLength={200} />
          </label>
          <label>
            Gelar depan (opsional)
            <input name="honorific_prefix" maxLength={50} />
          </label>
          <label>
            Gelar belakang (opsional)
            <input name="honorific_suffix" maxLength={100} />
          </label>
          <button type="submit">Simpan orang</button>
        </form>
      </details>

      <details>
        <summary>Tambah penugasan (definitif / Plt / Plh / Pj)</summary>
        <form action={createAssignmentAction} className="form">
          <label>
            Orang
            <select name="person_id" required>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jabatan
            <select name="position_id" required>
              {positions.map((p) => (
                <option key={p.position_id} value={p.position_id}>
                  {p.position_title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jenis penugasan
            <select name="assignment_type_code" required defaultValue="definitif">
              <option value="definitif">Definitif</option>
              <option value="plt">Plt.</option>
              <option value="plh">Plh.</option>
              <option value="pj">Pj.</option>
            </select>
          </label>
          <label>
            Tanggal mulai
            <input type="date" name="start_date" defaultValue={today} required />
          </label>
          <label>
            Tanggal berakhir (opsional)
            <input type="date" name="end_date" />
          </label>
          <label>
            Rujukan SK (opsional)
            <input name="appointment_reference" maxLength={300} />
          </label>
          <button type="submit">Simpan penugasan</button>
        </form>
      </details>

      <details>
        <summary>Catat verifikasi</summary>
        <form action={recordVerificationAction} className="form">
          <label>
            Yang diverifikasi
            <select name="target" required>
              <optgroup label="Orang">
                {persons.map((p) => (
                  <option key={p.id} value={`person:${p.id}`}>
                    {`Orang: ${p.full_name}`}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Jabatan">
                {positions.map((p) => (
                  <option key={p.position_id} value={`position:${p.position_id}`}>
                    {`Jabatan: ${p.position_title}`}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Unit">
                {units.map((u) => (
                  <option key={u.id} value={`organization_unit:${u.id}`}>
                    {`Unit: ${u.name}`}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Penugasan">
                {assignments.map((a) => (
                  <option key={a.id} value={`assignment:${a.id}`}>
                    {`Penugasan: ${a.person_name} — ${a.position_title}`}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            Status
            <select name="status" required defaultValue="verified">
              <option value="verified">Terverifikasi</option>
              <option value="needs_verification">Perlu verifikasi</option>
              <option value="expired">Kedaluwarsa</option>
              <option value="rejected">Ditolak</option>
            </select>
          </label>
          <label>
            Jenis sumber
            <select name="source_type" required defaultValue="sk">
              <option value="sk">SK</option>
              <option value="perwali">Perwali</option>
              <option value="portal_resmi">Portal resmi</option>
              <option value="media">Media</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </label>
          <label>
            Rujukan sumber (nomor dokumen / URL)
            <input name="source_reference" maxLength={500} />
          </label>
          <button type="submit">Catat verifikasi</button>
        </form>
        <p className="muted">
          Hanya pengguna dengan izin verifikasi yang dapat mencatat. Menerbitkan tidak sama dengan
          memverifikasi.
        </p>
      </details>
    </>
  );
}
