import { BASE, $, esc } from './common.js';
import '../styles/guide.css';
import '../styles/about.css';

const CAT_ORDER = ['制服', '发型', '面部', '头部饰品', '颈部', '手臂', '腰部', '背部', '滑板', '终结技'];
const FIELD_CN = { name: '名称', asset_id: '资产 ID', rarity: '稀有度（原文）', rarity_base: '稀有度（归一）', ethnicity: '种族', sheet: '合集图' };

Promise.all([
  fetch(BASE + 'mirror/manifest.json').then((r) => r.json()),
  fetch(BASE + 'data/archive.json').then((r) => r.json()),
]).then(([m, a]) => {
  const t = m.totals, c = m.checks, s = m.source;
  const genders = ['男性', '女性', '通用'];
  const cats = CAT_ORDER.filter((k) => m.byCategory[k]);
  const thumbs = a.records.filter((r) => r.thumb).length;
  const yes = (v) => (v ? '<b class="ok">是</b>' : '<b class="bad">否</b>');
  $('#audit').innerHTML = `
    <dl class="audit__nums">
      <div><dt>上游文件</dt><dd class="num">${t.files.toLocaleString()}</dd></div>
      <div><dt>记录</dt><dd class="num">${t.records.toLocaleString()}</dd></div>
      <div><dt>图像文件</dt><dd class="num">${t.images.toLocaleString()}</dd><small>PNG ${t.png} · GIF ${t.gif}</small></div>
      <div><dt>部位分类</dt><dd class="num">${t.categories}</dd></div>
      <div><dt>镜像体积</dt><dd class="num">${(t.bytes / 1048576).toFixed(0)}<small> MB</small></dd></div>
    </dl>
    <div class="audit__grid">
      <div class="audit__card">
        <h3>核对结果</h3>
        <ul class="audit__checks">
          <li>上游仓库：<a class="link-u" href="${esc(s.repo)}/tree/${esc(s.commit)}" target="_blank" rel="noopener">${esc(s.repo.replace('https://github.com/', ''))} @ ${esc(s.commit.slice(0, 7))}</a>（上游最后提交 ${esc(s.commitDate.slice(0, 10))}）</li>
          <li>本站同步时间：${esc(m.fetchedAt.slice(0, 16).replace('T', ' '))} UTC</li>
          <li>每个文件的 git 校验值与上游一致：${yes(!c.problems.length)}（同步脚本发现任何不一致都会中止）</li>
          <li>原站线上页面与仓库里的 index.html 逐字节相同：${yes(c.liveMatchesRepo)}</li>
          <li>线上页面内嵌的 ${c.liveRecords} 条数据与 clothes.json 逐条逐字段一致：${yes(c.liveRecords === t.records && !c.problems.length)}</li>
          <li>记录引用了却缺失的图片：${c.missingImages.length} 个；仓库里有却没有记录的图片：${c.imagesWithoutRecord.length} 个</li>
          <li>本站另外生成的缩略图：${thumbs} 张（只用于列表加载，大图和下载一律用原文件）</li>
        </ul>
      </div>
      <div class="audit__card">
        <h3>原样留空的字段</h3>
        <p class="mute">原资料里没有填的字段，本站同样留空，不补、不猜。</p>
        <ul class="audit__checks">${Object.entries(FIELD_CN).map(([k, n]) => `<li>${n}：${m.emptyFields[k]} 条为空</li>`).join('')}</ul>
      </div>
    </div>
    <div class="audit__card">
      <h3>按性别和部位</h3>
      <div class="audit__tbl"><table>
        <thead><tr><th></th>${cats.map((k) => `<th>${k}</th>`).join('')}<th>合计</th></tr></thead>
        <tbody>${genders.map((g) => `<tr><th>${g}</th>${cats.map((k) => `<td>${m.byGenderCategory[g + '/' + k] || '·'}</td>`).join('')}<td><b>${m.byGender[g]}</b></td></tr>`).join('')}
        <tr class="sum"><th>合计</th>${cats.map((k) => `<td>${m.byCategory[k]}</td>`).join('')}<td><b>${t.records}</b></td></tr></tbody>
      </table></div>
    </div>
    <div class="audit__card">
      <h3>上游没有公开、本站因此没有镜像的内容</h3>
      <ul class="audit__checks">${m.notPublished.map((n) => `<li><span class="mono">${esc(n.path)}</span>：${esc(n.note)}</li>`).join('')}</ul>
      <p class="mute">这些内容在 Kaglorn 的 README 里提到过，但没有上传到公开仓库，原站页面也没有用到。本站不声称拥有它们。</p>
    </div>
    <p class="audit__links"><a class="link-u" href="${BASE}mirror/" target="_blank" rel="noopener">打开原版页面（本站镜像）</a><a class="link-u" href="${BASE}mirror/manifest.json" target="_blank" rel="noopener">镜像清单 manifest.json</a><a class="link-u" href="${BASE}archive/">进入图鉴</a></p>`;
}).catch(() => { $('#audit').innerHTML = '<p>镜像清单读取失败，请刷新重试。</p>'; });
