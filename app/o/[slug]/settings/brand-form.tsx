"use client";
import { useState } from "react";
import { updateBrand } from "./actions";

const PRESETS = ["#1e4d3b", "#b3402a", "#6f4e37", "#1f3a5f", "#6d28d9", "#292524"];
const DEFAULT = "#1e4d3b";

export default function BrandForm({ slug, tenant }: { slug: string; tenant: any }) {
  const [color, setColor] = useState(
    typeof tenant.brand_color === "string" && /^#[0-9a-fA-F]{6}$/.test(tenant.brand_color) ? tenant.brand_color : DEFAULT
  );
  return (
    <form action={updateBrand} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="brand_color" value={color} />
      <div>
        <p className="label">Logo</p>
        <div className="flex items-center gap-3">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt="Current logo" className="w-14 h-14 rounded-full object-cover border border-stone-200" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 text-xs">No logo</div>
          )}
          <div>
            <input type="file" name="logo" accept="image/*" className="text-sm" />
            <p className="text-xs text-stone-400 mt-1">Square logo works best. Max 2 MB. Shown on the customer card.</p>
          </div>
        </div>
      </div>
      <div>
        <p className="label">Card color</p>
        <div className="flex gap-2 items-center flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setColor(p)}
              aria-label={`Use color ${p}`}
              className="w-9 h-9 rounded-full"
              style={{ background: p, outline: color.toLowerCase() === p ? "2px solid #1c1917" : "2px solid transparent", outlineOffset: "2px" }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-9 h-9 cursor-pointer bg-transparent"
            title="Pick a custom color"
          />
          <span className="text-xs text-stone-400 ml-1">Tap a swatch or pick your own.</span>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Address <span className="text-stone-400 font-normal">(shown on card)</span></label>
          <input name="address" className="input" defaultValue={tenant.address ?? ""} placeholder="123 King St W, Kitchener" />
        </div>
        <div>
          <label className="label">Hours <span className="text-stone-400 font-normal">(shown on card)</span></label>
          <input name="hours" className="input" defaultValue={tenant.hours ?? ""} placeholder="Mon–Sun 11am–10pm" />
        </div>
      </div>
      <button className="btn-primary">Save brand</button>
      <p className="text-xs text-stone-400">This is how the wallet card looks to your customers — your logo, your color.</p>
    </form>
  );
}
