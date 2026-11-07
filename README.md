# 段考考務即時管理系統

Cloudflare Workers 提供前端與 API。具 SQLite 儲存空間的 Durable Object 保存考程、班級、教師名冊、出缺席、通報與公告，並用 WebSocket 同步各畫面。

## 本機開發

1. 安裝 Node.js 22.12 以上，再執行 `npm ci`。
2. 將 `.dev.vars.example` 複製成 `.dev.vars`，填入自行設定的 `ADMIN_USERNAME` 與 `ADMIN_PASSWORD`。
3. 執行 `npm run dev`，開啟 [本機系統](http://localhost:3000)。資料會保存在專案內的 `.wrangler/state`。
4. 修改前端後重新執行 `npm run build`。執行 `npm run lint` 可檢查型別。

## Cloudflare 部署

首次部署時，用 `npx wrangler login` 登入 Cloudflare。準備一份私密的 JSON 檔，填入 `ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH` 與唯一的 `ADMIN_ROTATION_ID`。正式環境只接受雜湊形式的初始密碼。使用 scrypt（N=32768、r=8、p=3），將 16 位元組隨機 salt 與 32 位元組雜湊各轉為十六進位，格式為 `scrypt$32768,8,3$<salt>$<雜湊>`。

```sh
npm run deploy -- --secrets-file /path/to/admin-secrets.json
```

後續部署可直接執行 `npm run deploy`。更新 `ADMIN_ROTATION_ID` 會重新啟用並更新初始管理員帳密，撤銷該帳號的舊登入。部署用帳號名稱須避開其他既有管理員帳號。沿用相同識別碼時，系統會使用教務端已儲存的帳密。

## 首次使用

- 從 `/admin/settings` 登入，設定學校與考程資訊，並新增考場。
- 可在「考務設定 → 年級管理」新增年級代碼與顯示名稱。改名會同步到選班、公告與報表，原有班級指派沿用相同代碼。
- 到 `/admin/teachers` 新增或匯入教師帳號，再指派考場。每次最多匯入 50 筆。需要覆蓋超過 50 筆時，第一批使用覆蓋，其餘批次使用合併。匯出的教師名冊只包含名冊欄位。
- 從 `/attendance` 或 `/blackboard` 選擇班級，再進入出席即時看板或電子黑板。公開資料可顯示出席人數、缺席座號及系統標準假別。姓名、自由填寫的缺席原因與分節考場通報限教務管理員與該班該節的受指派教師查閱。
