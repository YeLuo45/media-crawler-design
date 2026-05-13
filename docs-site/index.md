---
layout: home

hero:
  name: "MediaCrawler Design"
  text: "多平台自媒体爬虫框架"
  tagline: "基于 NanmiCoder/MediaCrawler 源码的架构设计分析"
  image:
    src: /logo.svg
    alt: MediaCrawler
  actions:
    - theme: brand
      text: 系统架构
      link: /architecture
    - theme: brand
      text: 平台实现
      link: /platforms

features:
  - icon: 🕷️
    title: 多平台支持
    details: 统一爬虫接口，支持小红书、抖音、快手、B站、微博、百度贴吧、知乎 7 大平台
    link: /platforms
    linkText: 查看详情
  - icon: ⚡
    title: 异步高并发
    details: 基于 asyncio 的异步架构，支持高并发爬取，数据高效流转
    link: /architecture
    linkText: 查看详情
  - icon: 💾
    title: 多存储后端
    details: CSV、JSON、JSONL、SQLite、MySQL、MongoDB、Excel 多种存储方式自由切换
    link: /storage
    linkText: 查看详情
  - icon: 🔐
    title: 多认证方式
    details: 二维码登录、手机号登录、Cookie 登录三种认证方式适配不同场景
    link: /auth
    linkText: 查看详情
  - icon: 🛡️
    title: 反爬对抗
    details: CDP 模式、代理 IP 池、请求签名等多层反爬策略
    link: /anti-crawler
    linkText: 查看详情
  - icon: 🔧
    title: 模块化设计
    details: 工厂模式 + 抽象基类，平台实现解耦，易于扩展新平台
    link: /architecture
    linkText: 查看详情
---
