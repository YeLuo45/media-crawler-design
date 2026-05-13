import { defineConfig } from "vitepress";

export default defineConfig({
  title: "MediaCrawler Design",
  description: "MediaCrawler 多平台自媒体爬虫框架架构设计文档",
  lang: "zh-CN",
  base: "/media-crawler-design/",
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "首页", link: "/" },
      { text: "架构", link: "/architecture" },
      { text: "平台", link: "/platforms" },
      { text: "存储", link: "/storage" },
      { text: "认证", link: "/auth" },
      { text: "反爬", link: "/anti-crawler" },
    ],
    sidebar: [
      {
        text: "首页",
        link: "/",
      },
      {
        text: "系统架构",
        link: "/architecture",
      },
      {
        text: "平台实现",
        link: "/platforms",
      },
      {
        text: "数据存储",
        link: "/storage",
      },
      {
        text: "认证方式",
        link: "/auth",
      },
      {
        text: "反爬策略",
        link: "/anti-crawler",
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/NanmiCoder/MediaCrawler" },
    ],
    footer: {
      message: "基于 MediaCrawler 开源项目构建",
      copyright: "Copyright © 2024-present MediaCrawler Contributors",
    },
  },
});
