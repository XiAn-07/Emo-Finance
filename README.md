# 👾 Emo-Finance (情绪记账) | 基于大模型的个人行为财务分析终端

[![Deploy with Vercel](https://vercelbutton.com/api/button.svg)](你的Vercel链接)

## 📖 项目简介
Emo-Finance 是一款将 **行为金融学** 与 **LLM 智能体(Agent)** 相结合的创新个人记账应用。
它打破了传统流水账的模式，引入“劳累度”与“冲动度”等情绪指标，并通过本地数据驱动的赛博宠物（Moni）提供实时的财务心理映射，最终利用 LLM 生成深度的财务诊断与干预建议。

**🌍 线上体验地址**: [点击这里访问](https://emo-finance.vercel.app/) *(注：本项目采用 BYOK 模式，您的数据和密钥仅保存在本地浏览器)*

## ✨ 核心特性 & 技术亮点

*   **🧠 具身化 Agent 诊断引擎**: 并非简单的 API 透传。构建了 `行为特征提取 -> 心理动机推理 -> 行动建议生成` 的思维链（Chain of Thought），将大模型的推理过程可视化展示。
*   **🎮 情绪可视化与游戏化干预**: 开发了基于状态机驱动的“赛博宠物”系统，用户的收支行为与情绪指标会实时反馈在宠物的生存状态上，实现“心理软干预”。
*   **📊 多维财务人格建模**: 利用 Recharts 构建 6 维度财务健康雷达图（涵盖情绪回报率、消费理性度、生存刚需比等）。
*   **🔐 隐私优先架构 (BYOK)**: 采用无后端设计 (React + LocalStorage)，用户需自带 API Key，从物理层面杜绝敏感财务数据与凭证的云端泄露。

## 🛠️ 技术栈
*   **前端框架**: React 18 + Vite
*   **UI / 样式**: Tailwind CSS + Lucide Icons + Glassmorphism 拟态设计
*   **数据层**: 纯客户端 LocalStorage 状态管理
*   **AI 接口**: 兼容 OpenAI 格式的大模型 API (默认推荐 DeepSeek / GLM-4)
*   **部署**: CI/CD via Vercel

## 🚀 启动指引
```bash
# 安装依赖
npm install

# 本地运行
npm run dev
