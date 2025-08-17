import fs from 'fs-extra'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { logger } from './logger'
import { BranchStrategy, BranchStrategyConfig } from './types'

/**
 * 分支可视化器类
 * 用于生成分支结构和关系的可视化表示
 */
export class BranchVisualizer {
  private repoPath: string
  private outputDir: string
  private format: 'text' | 'svg' | 'html'

  /**
   * 构造函数
   * @param repoPath 仓库路径
   * @param outputDir 输出目录
   * @param format 输出格式
   */
  constructor(
    repoPath: string = process.cwd(),
    outputDir: string = path.join(process.cwd(), 'visualizations'),
    format: 'text' | 'svg' | 'html' = 'svg'
  ) {
    this.repoPath = repoPath
    this.outputDir = outputDir
    this.format = format
  }

  /**
   * 初始化可视化器
   */
  public async initialize(): Promise<void> {
    try {
      // 确保输出目录存在
      await fs.ensureDir(this.outputDir)
      logger.info(`分支可视化器已初始化，输出目录: ${this.outputDir}`)
    } catch (error) {
      logger.error(`初始化分支可视化器失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 生成分支可视化
   * @param branchStrategyConfig 分支策略配置
   * @param options 可选配置
   * @returns 可视化文件路径
   */
  public async generateBranchVisualization(
    branchStrategyConfig: BranchStrategyConfig,
    options: { showMerged?: boolean, showRemote?: boolean } = {} 
  ): Promise<string> {
    try {
      const { showMerged = false, showRemote = false } = options

      // 生成可视化数据
      const branchData = await this.getBranchData(showMerged, showRemote)

      // 根据输出格式生成可视化内容
      const outputPath = await this.renderVisualization(branchData, branchStrategyConfig)

      logger.success(`分支可视化已生成: ${outputPath}`)
      return outputPath
    } catch (error) {
      logger.error(`生成分支可视化失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 获取分支数据
   * @param showMerged 是否显示已合并分支
   * @param showRemote 是否显示远程分支
   * @returns 分支数据
   */
  private async getBranchData(showMerged: boolean, showRemote: boolean): Promise<any> {
    try {
      // 检查是否在Git仓库中
      if (!(await fs.pathExists(path.join(this.repoPath, '.git')))) {
        throw new Error(`${this.repoPath} 不是一个Git仓库`)
      }

      // 构建git命令
      let gitCommand = 'git branch'
      if (showRemote) {
        gitCommand += ' -a'
      }

      // 执行git命令获取分支列表
      const branchOutput = execSync(gitCommand, { cwd: this.repoPath, encoding: 'utf8' })

      // 解析分支输出
      const branches = branchOutput
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(line => {
          const isCurrent = line.startsWith('*')
          const branchName = isCurrent ? line.substring(2).trim() : line.trim()
          return {
            name: branchName,
            isCurrent,
            isRemote: branchName.includes('remotes/')
          }
        })

      // 获取分支关系（简化版）
      const branchRelations = []
      for (const branch of branches) {
        if (branch.isRemote) continue

        try {
          // 获取分支的最近提交
          const commitHash = execSync(`git rev-parse ${branch.name}`, { cwd: this.repoPath, encoding: 'utf8' }).trim()
          // 获取分支的上游分支
          let upstreamBranch = ''
          try {
            upstreamBranch = execSync(`git rev-parse --abbrev-ref ${branch.name}@{upstream}`, { cwd: this.repoPath, encoding: 'utf8' }).trim()
          } catch (e) {
            // 没有上游分支
          }

          branchRelations.push({
            branch: branch.name,
            commitHash,
            upstreamBranch
          })
        } catch (e) {
          logger.warn(`获取分支 ${branch.name} 信息失败: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      return {
        branches,
        relations: branchRelations
      }
    } catch (error) {
      logger.error(`获取分支数据失败: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * 渲染可视化内容
   * @param branchData 分支数据
   * @param branchStrategyConfig 分支策略配置
   * @returns 输出文件路径
   */
  private async renderVisualization(
    branchData: any,
    branchStrategyConfig: BranchStrategyConfig
  ): Promise<string> {
    const timestamp = Date.now()
    let outputPath = ''

    switch (this.format) {
      case 'text':
        outputPath = path.join(this.outputDir, `branch-visualization-${timestamp}.txt`)
        await this.renderTextVisualization(branchData, branchStrategyConfig, outputPath)
        break
      case 'svg':
        outputPath = path.join(this.outputDir, `branch-visualization-${timestamp}.svg`)
        await this.renderSvgVisualization(branchData, branchStrategyConfig, outputPath)
        break
      case 'html':
        outputPath = path.join(this.outputDir, `branch-visualization-${timestamp}.html`)
        await this.renderHtmlVisualization(branchData, branchStrategyConfig, outputPath)
        break
    }

    return outputPath
  }

  /**
   * 渲染文本格式的可视化
   */
  private async renderTextVisualization(
    branchData: any,
    branchStrategyConfig: BranchStrategyConfig,
    outputPath: string
  ): Promise<void> {
    let content = '=== 分支可视化 ===\n\n'
    content += `当前策略: ${branchStrategyConfig.strategy}\n`
    content += `基础分支: ${branchStrategyConfig.baseBranch}\n\n`

    content += '=== 分支列表 ===\n'
    for (const branch of branchData.branches) {
      const prefix = branch.isCurrent ? '* ' : '  '
      const remoteTag = branch.isRemote ? ' (远程)' : ''
      content += `${prefix}${branch.name}${remoteTag}\n`
    }

    content += '\n=== 分支关系 ===\n'
    for (const relation of branchData.relations) {
      if (relation.upstreamBranch) {
        content += `${relation.branch} -> ${relation.upstreamBranch}\n`
      } else {
        content += `${relation.branch} (无上游分支)\n`
      }
    }

    await fs.writeFile(outputPath, content, 'utf8')
  }

  /**
   * 渲染SVG格式的可视化
   */
  private async renderSvgVisualization(
    branchData: any,
    branchStrategyConfig: BranchStrategyConfig,
    outputPath: string
  ): Promise<void> {
    // 简化的SVG渲染实现
    const width = 800
    const height = 600
    const nodeRadius = 20
    const verticalSpacing = 60

    let svgContent = `<svg width=