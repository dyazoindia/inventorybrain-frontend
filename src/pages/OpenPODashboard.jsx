import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { portalPOApi, inventoryApi } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { Empty, Loading, fmtN } from "../components/ui";
import toast from "react-hot-toast";

const PORTALS = ["AMZ", "FLK", "ZPT", "BLK"];
const PNAMES = { AMZ: "Amazon", FLK: "Flipkart", ZPT: "Zepto", BLK: "Blinkit" };
const PCOLORS = { AMZ: "#e65100", FLK: "#1565c0", ZPT: "#1b5e20", BLK: "#6a1b9a" };

export default function OpenPODashboard() {
  const { isAdmin, user } = useAuth();
  const isOps = user && user.role === "operations";
  const qc = useQueryClient();

  const [portal, setPortal] = useState("AMZ");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);

  const [form, setForm] = useState({
    asin: "",
    openPOQty: "",
    poReference: "",
    notes: "",
  });

  // ✅ FIXED handler
  const handleChange = (field) => (e) => {
    setForm((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  // ================= API =================

  const { data: poData, isLoading } = useQuery({
    queryKey: ["portal-po", portal],
    queryFn: () => portalPOApi.list({ portal }).then((r) => r.data),
  });

  const { data: invData } = useQuery({
    queryKey: ["inventory-all"],
    queryFn: () => inventoryApi.getLatest().then((r) => r.data),
  });

  const shipMut = useMutation({
    mutationFn: (d) => portalPOApi.ship(d.id, { shippedQty: d.qty }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries(["portal-po"]);
    },
  });

  const deliverMut = useMutation({
    mutationFn: (d) => portalPOApi.deliver(d.id, { deliveredQty: d.qty }),
    onSuccess: () => {
      toast.success("Delivered");
      qc.invalidateQueries(["portal-po"]);
    },
  });

  const createMut = useMutation({
    mutationFn: (d) => portalPOApi.create(d),
    onSuccess: () => {
      toast.success("Created!");
      qc.invalidateQueries(["portal-po"]);
      setModal(false);
      setForm({ asin: "", openPOQty: "", poReference: "", notes: "" });
    },
  });

  // ================= DATA =================

  const allPOs = poData?.portalPOs || [];
  const invRows = invData?.rows || [];

  const whMap = {};
  invRows.forEach((r) => {
    whMap[r.asin] = r.whInv;
  });

  let rows = allPOs;

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.sku?.toLowerCase().includes(q) ||
        r.asin?.toLowerCase().includes(q)
    );
  }

  if (isLoading) return <Loading text="Loading..." />;

  // ================= UI =================

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div className="sec">Open PO Dashboard</div>

        {(isAdmin || isOps) && (
          <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>
            + Add PO
          </button>
        )}
      </div>

      {/* PORTALS */}
      <div style={{ display: "flex", marginBottom: 16 }}>
        {PORTALS.map((p) => (
          <button
            key={p}
            onClick={() => setPortal(p)}
            style={{
              padding: "10px 18px",
              background: portal === p ? PCOLORS[p] : "#eee",
              color: portal === p ? "#fff" : "#000",
              border: "none",
              cursor: "pointer",
            }}
          >
            {PNAMES[p]}
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <input
        placeholder="Search SKU / ASIN..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10, padding: 6 }}
      />

      {/* TABLE */}
      {rows.length === 0 ? (
        <Empty title="No PO Found" />
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Open PO</th>
              <th>Shipped</th>
              <th>Pending</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const pending = (r.openPOQty || 0) - (r.shippedQty || 0);

              return (
                <tr key={r._id}>
                  <td>{r.sku || r.asin}</td>
                  <td>{fmtN(r.openPOQty)}</td>

                  <td>
                    {(isAdmin || isOps) ? (
                      <button
                        onClick={() => {
                          const qty = prompt("Enter shipped qty:", r.shippedQty || 0);
                          if (qty !== null) {
                            shipMut.mutate({
                              id: r._id,
                              qty: parseInt(qty) || 0,
                            });
                          }
                        }}
                      >
                        {r.shippedQty || "Enter"}
                      </button>
                    ) : (
                      r.shippedQty
                    )}
                  </td>

                  <td>{fmtN(pending)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* MODAL */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <div className="modal">
            <h3>Add {PNAMES[portal]} PO</h3>

            <input
              placeholder="ASIN"
              value={form.asin}
              onChange={handleChange("asin")}
            />

            <input
              type="number"
              placeholder="Open PO Qty"
              value={form.openPOQty}
              onChange={handleChange("openPOQty")}
            />

            <input
              placeholder="PO Ref"
              value={form.poReference}
              onChange={handleChange("poReference")}
            />

            <input
              placeholder="Notes"
              value={form.notes}
              onChange={handleChange("notes")}
            />

            <div style={{ marginTop: 10 }}>
              <button onClick={() => setModal(false)}>Cancel</button>

              <button
                disabled={createMut.isPending}
                onClick={() => {
                  createMut.mutate({
                    asin: form.asin,
                    portal,
                    openPOQty: parseInt(form.openPOQty) || 0,
                    poReference: form.poReference,
                    notes: form.notes,
                  });
                }}
              >
                {createMut.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
