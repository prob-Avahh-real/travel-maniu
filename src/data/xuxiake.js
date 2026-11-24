// 徐霞客的旅行路线（霞客路）：一条真实历史足迹的"朝碧海而暮苍梧"之路。
// 马牛沿着这条路走过（收集到对应地点的明信片），就能继承他的行路精神。
// 新增一段路 = 在这里加一条 { spotId, stage, note }，引擎与图鉴自动跟着变。

export const XU_XIAKE_MOTTO = '丈夫当朝碧海而暮苍梧';

// spotId 必须指向 SPOTS 里真实存在的地点；顺序大致按徐霞客"江南→浙江→福建→
// 中原→贵州→广西→云南"的行迹推进。
export const XU_XIAKE_ROUTE = [
  { spotId: 'creek_town', stage: '江南启程', note: '从水乡出发，一路向西南。' },
  { spotId: 'islands', stage: '天台问海', note: '潮音在耳，海天一线。' },
  { spotId: 'old_tea_hill', stage: '武夷寻茶', note: '九曲溪畔，岩骨花香。' },
  { spotId: 'bamboo_temple', stage: '嵩山访碑', note: '古刹钟声，碑碣如林。' },
  { spotId: 'terraces', stage: '黔山梯云', note: '田随山势，如梯如磴。' },
  { spotId: 'old_pier', stage: '漓江泛舟', note: '山水如画，船行其中。' },
  { spotId: 'snow_pass', stage: '鸡足西行', note: '彩云之南，高山仰止。' },
];

export const XU_XIAKE_ROUTE_SPOT_IDS = XU_XIAKE_ROUTE.map((s) => s.spotId);
