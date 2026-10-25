# Spec Delta

## MODIFIED Requirements

### Requirement: F016 完整修订与唯一组合

当前固定交付 SHALL 使用完整版本 0.2.1-rc.3+rev.1，并结合源码 SHA 和产物散列校验，不能只按忽略构建元信息的 SemVer 判断。成员可独立安装或由办公套件携带，两入口 MUST 不重复组装；套件保留原条目配置和注入关系。

#### Scenario: 套件与独立来源
- **WHEN** 从旧独立成员安装切换到套件来源
- **THEN** 仅存在一个有效成员实例，旧配置按原 ID 命中，包内容与完整固定版本一致

