# 安装指南

## 前提条件
- Node.js 16.0.0 或更高版本
- pnpm 7.0.0 或更高版本
- Git

## 安装方式

### 方式一：全局安装

```bash
pnpm add -g sync-upstream
```

### 方式二：项目内安装

```bash
# 作为开发依赖安装
pnpm add -D sync-upstream

# 作为生产依赖安装
pnpm add sync-upstream
```

## 验证安装

安装完成后，可以通过以下命令验证是否安装成功：

```bash
sync-upstream --version
```

如果安装成功，将显示当前安装的版本号。

## 下一步

安装完成后，您可以继续阅读 [配置指南](/guide/configuration) 来了解如何配置sync-upstream。
