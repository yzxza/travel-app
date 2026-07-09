# 飞行家 · AI 旅行规划 —— Netlify 部署说明

发布后别人拿到网址即可用，看不到你的 API Key（Key 藏在服务器）。全程免费。

## 项目文件

```
travel-app-netlify/
├── index.html                       网页界面
├── netlify.toml                     Netlify 配置
├── netlify/
│   └── functions/
│       └── chat.js                  服务器中转（Key 藏这里）
└── deploy-guide-netlify.md          本说明
```

---

## 一、代码传到 GitHub（你已经建好 travel-app 仓库了）

把本文件夹里的 **index.html、netlify.toml**，以及 **netlify 文件夹**（里面含 functions/chat.js）一起拖到 GitHub 仓库上传。

- 若之前已传过 Vercel 版本，可以：进仓库把旧的 `api` 文件夹和 `package.json` 删掉（可选，不删也不影响 Netlify），再上传这几个新文件。
- 关键是 **netlify/functions/chat.js 的目录结构要保持**，直接拖 `netlify` 整个文件夹即可。

---

## 二、注册并连接 Netlify

1. 打开 netlify.com，点 **Sign up**，选 **GitHub** 登录授权。
2. 登录后点 **Add new site → Import an existing project**。
3. 选 **Deploy with GitHub**，授权后找到并选择你的 `travel-app` 仓库。

---

## 三、填环境变量并部署（关键）

在部署配置页，找到 **Environment variables**（也可先部署再去 Site settings → Environment variables 补）：

- Key：`SILICONFLOW_API_KEY`　Value：你的硅基流动 `sk-...`
- （可选）Key：`MODEL`　Value：`deepseek-ai/DeepSeek-V3`

其它构建设置保持默认（Build command 留空，Publish directory 填 `.` 或留空）。点 **Deploy site**。

等 1–2 分钟，部署成功后会给你一个网址，形如 `https://随机名.netlify.app`——**这就是能发给任何人的链接**。
（想换好记的名字：Site settings → Change site name。）

---

## 四、（推荐）加一道来源保护

防止别人拿你的接口地址到别的网站盗刷你的额度：

1. 复制你的 Netlify 网址，如 `https://xxx.netlify.app`。
2. Site settings → Environment variables 新增：
   - Key：`ALLOWED_ORIGIN`　Value：你的网址（结尾不要斜杠）
3. 到 Deploys 页点 **Trigger deploy → Deploy site** 让它生效。

---

## 五、务必设花费上限

代码已内置：限制输出长度、每 IP 每分钟最多 5 次、锁定只做旅行规划。最稳的一道防线是账户层面：**在硅基流动只充少量余额（如 20–50 元）**，用完接口自动停、不欠费。

---

## 常见问题

- **报"服务器未配置 API Key"**：环境变量 `SILICONFLOW_API_KEY` 没加或拼错，改完在 Deploys 里重新部署一次。
- **报模型不存在**：`MODEL` 用带前缀的完整名，如 `deepseek-ai/DeepSeek-V3`，以硅基"模型广场"显示为准。
- **点生成没反应/报 404**：确认 `netlify/functions/chat.js` 的目录结构没传错，且文件顶部保留了 `export const config = { path: "/api/chat" };`。
- **改了代码怎么更新**：在 GitHub 重新上传文件，Netlify 会自动重新部署。

卡在任何一步，把截图发我。
