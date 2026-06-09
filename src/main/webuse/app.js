(function() {
    const hasChartJS = (typeof Chart !== 'undefined');
    let records = [];
    let chartInstances = {};
    let budgets = {};
    const colorsFintech = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

    // ========== 1. 本地存储系统 ==========
    function loadStorage() {
        const saved = localStorage.getItem('fintech_pro_bills');
        records = saved ? JSON.parse(saved) : [];
        budgets = JSON.parse(localStorage.getItem('fintech_pro_budgets') || '{}');
    }
    function saveStorage() {
        localStorage.setItem('fintech_pro_bills', JSON.stringify(records));
        localStorage.setItem('fintech_pro_budgets', JSON.stringify(budgets));
    }

    // ========== 2. 核心 CSV 密码级解析算法 ==========
    function parseCSV(content) {
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        let headIdx = lines.findIndex(l => l.includes('交易时间') && l.includes('金额'));
        if(headIdx === -1) return [];
        const header = lines[headIdx].split(',');
        const col = {
            date: header.findIndex(h=>h.includes('交易时间')),
            type: header.findIndex(h=>h.includes('收/支')),
            amount: header.findIndex(h=>h.includes('金额')),
            merchant: header.findIndex(h=>h.includes('交易对方')),
            category: header.findIndex(h=>h.includes('交易分类')),
            status: header.findIndex(h=>h.includes('状态'))
        };

        const res = [];
        for (let i = headIdx + 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if(parts.length < 4) continue;
            if(col.status !== -1 && parts[col.status] && !parts[col.status].includes('成功')) continue;
            const date = (parts[col.date] || '').trim().split(' ')[0];
            const amtStr = (parts[col.amount] || '').replace(/[¥$,，]/g,'');
            const amt = parseFloat(amtStr);
            if(isNaN(amt) || amt === 0) continue;
            const typeRaw = parts[col.type] || '';
            let type = typeRaw.includes('收入') ? 'income' : (typeRaw.includes('支出') ? 'expense' : null);
            if(!type) continue;
            res.push({
                id: Date.now() + Math.random(),
                date,
                type,
                amount: amt,
                merchant: (parts[col.merchant] || '未知').trim(),
                category: (parts[col.category] || '其他').trim()
            });
        }
        return res;
    }

    // ========== 3. 核心指标量化监控引擎 ==========
    function updateStats() {
        const expRecs = records.filter(r => r.type === 'expense');
        const incRecs = records.filter(r => r.type === 'income');
        const exp = expRecs.reduce((s, r) => s + r.amount, 0);
        const inc = incRecs.reduce((s, r) => s + r.amount, 0);

        animateValue('balance', inc - exp);
        animateValue('totalIncome', inc);
        animateValue('totalExpense', exp);

        const maxExp = expRecs.length ? Math.max(...expRecs.map(r => r.amount)) : 0;
        animateValue('maxExpense', maxExp);

        const daysSet = new Set(expRecs.map(r => r.date));
        const activeDays = daysSet.size || 1;
        animateValue('burnRate', exp / activeDays);

        animateValue('savingsRate', inc > 0 ? ((inc - exp) / inc) * 100 : 0);

        const foodExp = expRecs.filter(r => r.category.includes('餐饮') || r.category.includes('买菜')).reduce((s, r) => s + r.amount, 0);
        animateValue('engelCoefficient', exp > 0 ? (foodExp / exp) * 100 : 0);

        const dailyExpMap = {};
        expRecs.forEach(r => dailyExpMap[r.date] = (dailyExpMap[r.date] || 0) + r.amount);
        const vals = Object.values(dailyExpMap);
        let vol = 0;
        if(vals.length > 1) {
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            vol = Math.sqrt(vals.reduce((acc, b) => acc + Math.pow(b - mean, 2), 0) / vals.length);
        }
        animateValue('volatility', vol);
    }

    function animateValue(id, val) {
        const el = document.getElementById(id); if(!el) return;
        el.innerText = (el.dataset.suffix !== '%' ? '¥' : '') + val.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + (el.dataset.suffix || '');
    }

    // ========== 4. 结构化风控与智能研报算法 ==========
    function refreshBudgetTab() {
        const mInput = document.getElementById('budgetMonth');
        if(!mInput.value) mInput.value = new Date().toISOString().substring(0, 7);
        const month = mInput.value;
        const budget = budgets[month] || 0;
        document.getElementById('budgetAmount').value = budget || '';

        const mRecs = records.filter(r => r.date.startsWith(month));
        const mExpRecs = mRecs.filter(r => r.type === 'expense');
        const mExp = mExpRecs.reduce((s, r) => s + r.amount, 0);
        const mInc = mRecs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);

        const bStatus = document.getElementById('budgetStatus');
        if(budget > 0) {
            const remain = budget - mExp;
            const pct = Math.min(100, (mExp / budget) * 100);
            const isDanger = remain < 0;
            const isWarn = !isDanger && pct > 80;
            let colorClass = isDanger ? 'danger' : (isWarn ? 'warning' : '');
            bStatus.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-weight:600;">
                    <span>已流出：¥${mExp.toLocaleString()}</span>
                    <span style="color:${isDanger?'var(--expense)':'var(--income)'}">安全垫：¥${remain.toLocaleString()}</span>
                </div>
                <div class="progress-bar"><div class="progress-fill ${colorClass}" style="width:${pct}%"></div></div>
            `;
        } else bStatus.innerHTML = '<span style="color:#64748b;">未部署风控合约。</span>';

        const rGrid = document.getElementById('reportContainer');
        if(mRecs.length === 0) {
            rGrid.innerHTML = '<div style="grid-column: 1 / -1; color:#94a3b8; text-align:center;">此纪元无数据碎片。</div>';
            return;
        }

        const mCounts = {}; const mAmts = {};
        mExpRecs.forEach(r => {
            mCounts[r.merchant] = (mCounts[r.merchant] || 0) + 1;
            mAmts[r.merchant] = (mAmts[r.merchant] || 0) + r.amount;
        });
        const topMerchantAmt = Object.entries(mAmts).sort((a,b) => b[1] - a[1])[0] || ['无', 0];
        const topMerchantFreq = Object.entries(mCounts).sort((a,b) => b[1] - a[1])[0] || ['无', 0];
        const foodExp = mExpRecs.filter(r => r.category.includes('餐饮')).reduce((s, r) => s + r.amount, 0);
        const mEngel = mExp > 0 ? (foodExp / mExp) * 100 : 0;
        const maxR = mExpRecs.reduce((m, r) => r.amount > m.amount ? r : m, {amount:0, merchant:''});

        let riskTags = '';
        if(mEngel > 40) riskTags += `<span class="warning-tag">🚨 恩格尔系数过高 (${mEngel.toFixed(1)}%)</span>`;
        if(topMerchantFreq[1] > 10) riskTags += `<span class="warning-tag">⚠️ 节点高频依赖 (${topMerchantFreq[0]} 交易${topMerchantFreq[1]}次)</span>`;
        if(mExp > mInc && mInc > 0) riskTags += `<span class="warning-tag">🩸 现金流赤字</span>`;
        if(riskTags === '') riskTags = `<span class="info-tag">✅ 流动性架构健康</span>`;

        rGrid.innerHTML = `
            <div class="report-module">
                <h4>📊 宏观流动性诊断</h4>
                <p>总流入量级：<strong>¥${mInc.toLocaleString()}</strong></p>
                <p>总消耗量级：<strong>¥${mExp.toLocaleString()}</strong></p>
                <p>净结余流向：<strong style="color:${mInc>=mExp?'var(--income)':'var(--expense)'}">${mInc>=mExp?'盈余':'赤字'} ¥${Math.abs(mInc-mExp).toLocaleString()}</strong></p>
                <p>月度蓄水率：<strong>${mInc>0 ? ((mInc-mExp)/mInc*100).toFixed(1) : 0}%</strong></p>
            </div>
            <div class="report-module">
                <h4>🔬 微观交易行为穿透</h4>
                <p>最大资金黑洞：<strong>${topMerchantAmt[0]}</strong> (吸纳 ¥${topMerchantAmt[1].toLocaleString()})</p>
                <p>单笔峰值支出：<strong>¥${maxR.amount.toLocaleString()}</strong> (${maxR.merchant})</p>
                <p>最高频交互节点：<strong>${topMerchantFreq[0]}</strong> (共 ${topMerchantFreq[1]} 次握手)</p>
            </div>
            <div class="report-module" style="grid-column: 1 / -1; background: #fff;">
                <h4>🤖 智能风控与降级建议</h4>
                <div style="margin-bottom:12px;">${riskTags}</div>
                <p style="color:#475569; font-size: 14.5px;">
                    ${mInc>=mExp ? '系统研判本纪元资产负债表扩张良性。' : '资产池处于失血状态。'}
                    ${mEngel>40 ? '刚需消费占比较大，财务结构存在僵化风险，抗风险能力降低。' : '消费结构弹性较好，非刚需资本流出健康。'}
                    ${maxR.amount > (mExp*0.3) ? '且存在超大额单点流出，建议在下个纪元收紧大额非必要开支敞口。' : ''}
                </p>
            </div>
        `;
    }

    // ========== 5. Chart.js 旗舰版可视化渲染引擎 ==========
    function renderCharts() {
        if(!hasChartJS || records.length === 0) return;
        Object.values(chartInstances).forEach(c => c && c.destroy());
        const expRecs = records.filter(r => r.type === 'expense');

        // (1) 资产累计水位演进图
        const dCtx = document.getElementById('cumulativeChart').getContext('2d');
        const dailyNet = {};
        const sortedDates = [...new Set(records.map(r => r.date))].sort();
        sortedDates.forEach(d => dailyNet[d] = 0);
        records.forEach(r => dailyNet[r.date] += (r.type === 'income' ? r.amount : -r.amount));
        let runTotal = 0;
        const cumData = sortedDates.map(d => runTotal += dailyNet[d]);
        chartInstances['cum'] = new Chart(dCtx, {
            type: 'line', data: { labels: sortedDates, datasets: [{ label: '资产累计净值', data: cumData, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.2)', fill: true, tension: 0.3, pointRadius: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display: false} }, scales:{x:{ticks:{maxTicksLimit:8}}} }
        });

        // (2) 资金流出黑洞 Top 5 横向柱状图
        const mCtx = document.getElementById('merchantChart').getContext('2d');
        const mAmts = {}; expRecs.forEach(r => mAmts[r.merchant] = (mAmts[r.merchant] || 0) + r.amount);
        const top5 = Object.entries(mAmts).sort((a,b) => b[1] - a[1]).slice(0, 5);
        chartInstances['merch'] = new Chart(mCtx, {
            type: 'bar', data: { labels: top5.map(t=>t[0].substring(0,8)), datasets: [{ label: '吸金量', data: top5.map(t=>t[1]), backgroundColor: '#f43f5e', borderRadius: 4 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}} }
        });

        // (3) 支出类目环形图
        const pCtx = document.getElementById('expenseChart').getContext('2d');
        const catAmts = {}; expRecs.forEach(r => catAmts[r.category] = (catAmts[r.category] || 0) + r.amount);
        chartInstances['pie'] = new Chart(pCtx, {
            type: 'doughnut', data: { labels: Object.keys(catAmts), datasets: [{ data: Object.values(catAmts), backgroundColor: colorsFintech, borderWidth:0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: {legend:{position:'right'}} }
        });

        // (4) 消费行为三维画像雷达图
        const rCtx = document.getElementById('radarChart').getContext('2d');
        const dims = {'生存刚需':0, '发展提升':0, '享乐消费':0, '其他':0};
        expRecs.forEach(r => {
            if(/餐饮|买菜|医疗|住房/.test(r.category)) dims['生存刚需'] += r.amount;
            else if(/教育|交通|书籍/.test(r.category)) dims['发展提升'] += r.amount;
            else if(/娱乐|购物|游戏|旅游/.test(r.category)) dims['享乐消费'] += r.amount;
            else dims['其他'] += r.amount;
        });
        chartInstances['radar'] = new Chart(rCtx, {
            type: 'radar', data: { labels: Object.keys(dims), datasets: [{ label: '维度分布', data: Object.values(dims), backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: '#10b981', pointBackgroundColor: '#10b981' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}} }
        });

        // (5) 周期复合流向柱状趋势图
        const bCtx = document.getElementById('monthlyChart').getContext('2d');
        const monthly = {};
        records.forEach(r => { const m = r.date.substring(0,7); if(!monthly[m]) monthly[m] = {i:0,e:0}; r.type === 'income' ? monthly[m].i += r.amount : monthly[m].e += r.amount; });
        const mKeys = Object.keys(monthly).sort();
        chartInstances['month'] = new Chart(bCtx, {
            type: 'bar', data: { labels: mKeys, datasets: [
                    { type:'line', label:'净流动', data: mKeys.map(m=>monthly[m].i-monthly[m].e), borderColor:'#0f172a', tension:0.3 },
                    { type:'bar', label:'流入', data: mKeys.map(m=>monthly[m].i), backgroundColor:'rgba(16, 185, 129, 0.8)', borderRadius:4 },
                    { type:'bar', label:'流出', data: mKeys.map(m=>monthly[m].e), backgroundColor:'rgba(239, 68, 68, 0.8)', borderRadius:4 }
                ] }, options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // ========== 6. 数据列表检索与渲染 (极客升级版) ==========
    function updateTable() {
        const tb = document.getElementById('recordsBody');
        const typeEl = document.getElementById('typeFilter');
        const searchEl = document.getElementById('searchInput');

        const typeF = typeEl ? typeEl.value : 'all';
        const search = searchEl ? searchEl.value.toLowerCase() : '';

        // 动态计算智能风控异常阈值（当金额大于平均支出 3 倍且大于 500 元时）
        const expRecs = records.filter(x => x.type === 'expense');
        const avgExp = expRecs.length ? (expRecs.reduce((s, x) => s + x.amount, 0) / expRecs.length) : 0;
        const anomalyThreshold = Math.max(avgExp * 3, 500);

        // 多维过滤核心逻辑
        let filtered = records.filter(r => {
            if (typeF !== 'all' && r.type !== typeF) return false;
            if (search) {
                const pseudoHash = '0x' + Math.abs(Math.sin(r.id) * 100000000).toString(16).substring(0, 12);
                if (!(r.merchant.toLowerCase().includes(search) ||
                    r.category.toLowerCase().includes(search) ||
                    pseudoHash.toLowerCase().includes(search))) return false;
            }
            return true;
        });

        const todayStr = new Date().toISOString().split('T')[0];

        tb.innerHTML = filtered.slice(0, 150).map(r => {
            // 利用数据 ID 生成确定性的伪 TxHash
            const hash = '0x' + Math.abs(Math.sin(r.id) * 100000000).toString(16).substring(0, 12);
            // 判断网络状态 (当天的显示打包中，之前的显示已确权)
            const isPending = (todayStr === r.date);
            const statusHtml = isPending ? '<span class="status-badge status-pending">⏳ 侧链打包中</span>' : '<span class="status-badge status-success">✅ 已确权</span>';
            // 触发风控预警标红
            const isAnomaly = r.type === 'expense' && r.amount > anomalyThreshold;

            return `
                <tr class="${isAnomaly ? 'row-anomaly' : ''}" title="${isAnomaly ? '⚠️ 触发智能合约风控：单点流动性异常放大' : ''}">
                    <td>
                        <span class="tx-hash" onclick="navigator.clipboard.writeText('${hash}'); alert('已复制交易指纹: ${hash}');" title="点击复制 TxHash">
                            ${hash.substring(0,8)}...
                        </span>
                    </td>
                    <td style="color:#64748b;">${r.date}</td>
                    <td><span style="color:${r.type==='income'?'var(--income)':'var(--expense)'};font-weight:bold;">${r.type==='income'?'流入':'流出'}</span></td>
                    <td>${r.category}</td>
                    <td>${r.merchant}</td>
                    <td style="font-weight:bold; color:${r.type==='income'?'var(--income)':'var(--expense)'}">${r.type==='income'?'+':'-'}¥${r.amount.toFixed(2)}</td>
                    <td>${statusHtml}</td>
                </tr>`;
        }).join('') || '<tr><td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;">在当前区块高度下未检索到匹配的交易流</td></tr>';
    }

    function refreshAll() {
        updateStats();
        updateTable();
        if(document.getElementById('stats-tab').classList.contains('active')) renderCharts();
        if(document.getElementById('budget-tab').classList.contains('active')) refreshBudgetTab();
    }

    // ========== 7. 拖拽与原生文件双引擎读取监听控制系统 ==========
    const uploadArea = document.getElementById('uploadArea');
    const csvFile = document.getElementById('csvFile');

    uploadArea.addEventListener('click', () => csvFile.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', e => {
        e.preventDefault(); uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            csvFile.files = e.dataTransfer.files;
            csvFile.dispatchEvent(new Event('change'));
        }
    });

    csvFile.addEventListener('change', e => {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();

        reader.readAsText(file, 'UTF-8');
        reader.onload = e2 => {
            let content = e2.target.result;
            if(!content.includes('交易') && !content.includes('金额')) {
                const gbkReader = new FileReader();
                gbkReader.onload = e3 => processRecords(parseCSV(e3.target.result));
                gbkReader.readAsText(file, 'GBK');
            } else {
                processRecords(parseCSV(content));
            }
        };

        function processRecords(newRecs) {
            if(newRecs.length) {
                records = newRecs.sort((a,b)=>b.date.localeCompare(a.date));
                saveStorage(); refreshAll();
                alert(`导入成功: 系统已智能识别编码，并全新覆盖渲染了 ${records.length} 条交易节点`);
            } else {
                alert('未识别到有效流水数据，请检查 CSV 格式');
            }
        }
    });

    // ========== 8. 交互事件全量绑定区 ==========
    // 8.1 Tab 切换逻辑
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.tab + '-tab').classList.add('active');
        refreshAll();
    }));

    // 8.2 数据过滤与检索框监听
    const typeFilterEl = document.getElementById('typeFilter');
    const searchInputEl = document.getElementById('searchInput');
    if(typeFilterEl) typeFilterEl.addEventListener('change', updateTable);
    if(searchInputEl) searchInputEl.addEventListener('input', updateTable);

    // 8.3 导出 CSV 审计报表
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if(exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            if(!records.length) return alert('账本数据为空，无法执行导出。');
            let csv = '\uFEFF'; // 写入 BOM 头，防止 Excel 打开中文乱码
            csv += 'TxHash(交易指纹),时间戳,流向,分类,交易对手节点,金额(CNY),网络共识状态\n';

            const todayStr = new Date().toISOString().split('T')[0];
            records.forEach(r => {
                const hash = '0x' + Math.abs(Math.sin(r.id) * 100000000).toString(16).substring(0, 12);
                const status = (todayStr === r.date) ? '侧链打包中' : '已确权(Confirmed)';
                const direction = r.type === 'income' ? '流入' : '流出';
                csv += `"${hash}","${r.date}","${direction}","${r.category}","${r.merchant}","${r.amount}","${status}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Fintech_Ledger_Audit_Report.csv';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // 8.4 全局哈希摘要与风控合约
    document.getElementById('generateHashBtn').addEventListener('click', async () => {
        if(!records.length) return alert('账本为空');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records))))).map(b=>b.toString(16).padStart(2,'0')).join('');
        alert(`智能合约防篡改数据确权预演\n\nSHA-256 全量账本指纹摘要:\n${hash}`);
    });

    document.getElementById('saveBudgetBtn').addEventListener('click', () => {
        const m = document.getElementById('budgetMonth').value;
        const a = parseFloat(document.getElementById('budgetAmount').value);
        if(m && a >= 0) { budgets[m] = a; saveStorage(); refreshBudgetTab(); }
    });

    window.addEventListener('resize', () => { if(document.getElementById('stats-tab').classList.contains('active')) renderCharts(); });

    // ========== 9. 初始化启动 ==========
    loadStorage();
    refreshAll();
})();