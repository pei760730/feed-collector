# voc 去重契約檔(vendored)

從 canonical 來源 `pei760730/voc` 的 `contracts/dedup_vectors.json` 複製過來,給
`tests/dedupConformance.test.ts` 跑跨語言去重 conformance。

- **SSoT 在 voc**:`dedup_vectors.json` 是跨語言去重契約 canonical(voc 與 TeaBus-VOC 共用)。
  **不要在這裡手改**;改去重規則先改 voc canonical、各 repo 一起過,再重新 `cp` 過來。
- **feed 是 staging 模型、抽取規則自成一份**(`tt_` 前綴、unsupported → `raw_<ts>` 而非 path key),
  與 core groupKey 模型不同。本 conformance 因此做**模型翻譯**:`unsupported(raw_)` ⟺ canonical 的
  `path`。feed **不支援抖音**(無此平台),故 same_group 的純抖音案例會被 skip(已知差異,見測試註解)。
  目的是釘住「feed 抽取對 voc canonical 的分群意圖不漂移」,不是逐位元等同。
