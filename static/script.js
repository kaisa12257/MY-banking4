let viewDate = new Date();
let fixedExpenses = [];
let monthlyBudgets = {};

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {   
    document.getElementById(id).style.display = 'none';
}

function initDate() {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);
    if (document.getElementById('expDate')) document.getElementById('expDate').value = today;
    if (document.getElementById('fixedDate')) document.getElementById('fixedDate').value = today;
    if (document.getElementById('budgetMonth')) document.getElementById('budgetMonth').value = month;
}

async function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.style.display = 'block';

    const clickedBtn = document.querySelector(`button[onclick="showTab('${tabId}')"]`);
    if (clickedBtn) clickedBtn.classList.add('active');

    if (tabId === 'record') await loadList();
    if (tabId === 'fixed') {
        await loadBudgets();
        await loadFixedList();
        renderBudgetList();
    }
    if (tabId === 'calendar') {
        await loadBudgets();
        await loadFixedList();
        renderCal();
    }
    if (tabId === 'stats') {
        await loadBudgets();
        await loadFixedList();
        renderChart();
    }
    if (tabId === 'goal') {
        await loadBudgets();
        await loadFixedList();
        await loadGoal();
    }
}

// --- 인증 ---
async function doSignup() {
    const name = document.getElementById('s_nm').value;
    const email = document.getElementById('s_em').value;
    const password = document.getElementById('s_pw').value;
    const passwordRe = document.getElementById('s_pw_re').value;

    if (!name || !email || !password) return alert("항목을 모두 입력하세요.");
    if (password !== passwordRe) return alert("비밀번호가 일치하지 않습니다.");

    const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    alert(data.message);
    if (data.status === 'success') closeModal('signupModal');
}

async function doLogin() {
    const email = document.getElementById('l_em').value;
    const password = document.getElementById('l_pw').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.status === 'success') {
        window.userData = {
            name: data.user_name,
            email: data.user_email,
            joinedAt: data.joined_at
        };

        // ⭐ 추가된 부분: 로그인 성공 시 첫 화면 문구 카드 숨기기
        if (document.getElementById('welcomeCard')) {
            document.getElementById('welcomeCard').style.display = 'none';
        }

        document.getElementById('userDisplayName').innerText = data.user_name;
        document.getElementById('authBox').style.display = 'none';
        document.getElementById('userMenu').style.display = 'block';
        document.getElementById('topNav').style.display = 'flex';
        document.getElementById('mainContent').style.display = 'block';
        
        closeModal('loginModal');
        initDate();
        await loadBudgets();
        await loadFixedList();
        await loadList();
        await loadGoal();
        renderBudgetList();
    } else {
        alert(data.message);
    }
}

function openSettingsModal() {
    if (!window.userData) {
        alert("사용자 정보를 불러올 수 없습니다.");
        return;
    }

    document.getElementById('userMenu').style.display = 'none';

    const { name, email, joinedAt } = window.userData;
    const [id, domain] = email.split('@');
    const maskedId = id.substring(0, 3) + '*'.repeat(Math.max(0, id.length - 3));
    const maskedEmail = `${maskedId}@${domain}`;
    const formattedDate = new Date(joinedAt).toLocaleDateString();

    const infoArea = document.getElementById('userInfoArea');
    if (infoArea) {
        infoArea.innerHTML = `
            <p style="margin: 10px 0;"><b>👤 이름:</b> ${name}</p>
            <p style="margin: 10px 0;"><b>📧 이메일:</b> ${maskedEmail}</p>
            <p style="margin: 10px 0;"><b>📅 가입일:</b> ${formattedDate}</p>
        `;
    }

    document.getElementById('settingsModal').style.display = 'block';
}

async function confirmWithdrawal() {
    const check = confirm("정말로 탈퇴하시겠습니까?\n탈퇴 시 모든 데이터가 즉시 삭제되며, 2일 동안 같은 이메일로 재가입이 불가능합니다.");
    if (!check) return;

    const res = await fetch('/api/withdraw', { method: 'POST' });
    const result = await res.json();

    if (result.status === "success") {
        alert("회원 탈퇴가 완료되었습니다. 그동안 이용해주셔서 감사합니다.");
        
        // 1. 브라우저에 저장된 로그인 데이터(토큰 등)를 싹 지웁니다.
        localStorage.clear();
        sessionStorage.clear();
        
        // 2. 관리자님 정보를 담고 있던 전역 변수도 비웁니다.
        window.userData = null;
        
        // 3. 메인 페이지로 이동하면서 새로고침하여 초기화 상태로 만듭니다.
        window.location.href = "/"; 
    } else {
        alert(result.message);
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    if (id === 'settingsModal') {
        document.getElementById('userMenu').style.display = 'block';
    }
}

async function doLogout() {
    await fetch('/api/logout', { method: 'POST' });
    location.reload();
}

// --- 지출 ---
async function saveExp() {
    const amount = parseInt(document.getElementById('amt').value);
    const category = document.getElementById('cat').value;
    const description = document.getElementById('desc').value;
    const expense_date = document.getElementById('expDate').value;
    if (!amount) return alert("금액을 입력하세요.");

    await fetch('/api/add_expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, category, description, expense_date })
    });
    alert("저장되었습니다.");
    document.getElementById('amt').value = '';
    document.getElementById('desc').value = '';
    await loadList();
}

async function loadList() {
    const res = await fetch('/api/get_expenses');
    const result = await res.json();
    if (result.status !== 'success') return;
    const data = result.data || [];
    document.getElementById('listArea').innerHTML = '<h4>최근 소비 내역</h4>' + data.map(i => `
        <div class="list-item">
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:bold;">[${i.category}] ${i.description || '내역 없음'}</span>
                <span style="font-size:0.8rem; color:gray;">${i.expense_date}</span>
            </div>
            <span>${Number(i.amount).toLocaleString()}원
                <button onclick="delExp('${i.id}')" style="color:red; border:none; background:none; cursor:pointer; margin-left:5px;">X</button>
            </span>
        </div>
    `).join('');
}

async function delExp(id) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch('/api/delete_expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    await loadList();
}

// --- 월별 예산 ---
async function saveBudget() {
    const month = document.getElementById('budgetMonth').value;
    const amt = document.getElementById('monthlyBudget').value;
    if (!month || !amt) return alert("연월과 예산을 입력하세요.");

    await fetch('/api/save_budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, amount: parseInt(amt) })
    });
    alert(`${month} 예산이 저장/수정되었습니다.`);
    document.getElementById('monthlyBudget').value = '';
    await loadBudgets();
    renderBudgetList();
    await loadGoal();
}

function editBudget(month, amount) {
    document.getElementById('budgetMonth').value = month;
    document.getElementById('monthlyBudget').value = amount;
    document.getElementById('monthlyBudget').focus();
}

async function delBudget(month) {
    if (!confirm(`${month} 예산을 삭제하시겠습니까?`)) return;
    await fetch('/api/delete_budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month })
    });
    alert("삭제되었습니다.");
    await loadBudgets();
    renderBudgetList();
    await loadGoal();
}

async function loadBudgets() {
    const res = await fetch('/api/get_budgets');
    const result = await res.json();
    if (result.status !== 'success') return;
    monthlyBudgets = {};
    result.data.forEach(item => {
        monthlyBudgets[item.budget_month] = item.budget_amount;
    });
}

function renderBudgetList() {
    const area = document.getElementById('budgetListArea');
    if (!area) return;
    const sortedMonths = Object.keys(monthlyBudgets).sort().reverse();
    let html = '<h4>설정된 월별 예산</h4>';

    if (sortedMonths.length === 0) {
        html += '<p style="color:gray; font-size:0.85rem;">설정된 예산이 없습니다.</p>';
    } else {
        sortedMonths.forEach(m => {
            const amt = monthlyBudgets[m];
            html += `
                <div class="list-item">
                    <span>${m}</span>
                    <span>
                        <b>${Number(amt).toLocaleString()}원</b>
                        <button onclick="editBudget('${m}', ${amt})" style="color:blue; border:none; background:none; cursor:pointer; margin-left:8px;">✎</button>
                        <button onclick="delBudget('${m}')" style="color:red; border:none; background:none; cursor:pointer; margin-left:5px;">X</button>
                    </span>
                </div>`;
        });
    }
    area.innerHTML = html;
}

// --- 고정 지출 ---
async function saveFixedExp() {
    const desc = document.getElementById('fixedDesc').value;
    const amt = document.getElementById('fixedAmt').value;
    const dateInput = document.getElementById('fixedDate').value;
    if (!desc || !amt || !dateInput) return alert("항목을 모두 입력하세요.");

    await fetch('/api/add_fixed_expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, amount: parseInt(amt), fixed_date: dateInput })
    });
    alert("고정 지출 등록 완료");
    document.getElementById('fixedDesc').value = '';
    document.getElementById('fixedAmt').value = '';
    await loadFixedList();
    await loadGoal();
}

async function loadFixedList() {
    const res = await fetch('/api/get_fixed_expenses');
    const result = await res.json();
    if (result.status !== 'success') return;
    fixedExpenses = result.data || [];
    document.getElementById('fixedListArea').innerHTML = '<h4>고정 지출 목록</h4>' + fixedExpenses.map(f => `
        <div class="list-item">
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:bold;">${f.description}</span>
                <span style="font-size:0.8rem; color:var(--primary);">${f.fixed_date}</span>
            </div>
            <span><b>${Number(f.amount).toLocaleString()}원</b>
                <button onclick="delFixedExp('${f.id}')" style="color:red; border:none; background:none; cursor:pointer; margin-left:5px;">X</button>
            </span>
        </div>
    `).join('');
}

async function delFixedExp(id) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch('/api/delete_fixed_expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    await loadFixedList();
}

// --- 달력 ---
function changeMonth(offset) {
    viewDate.setMonth(viewDate.getMonth() + offset);
    renderCal();
}

async function renderCal() {
    const res = await fetch('/api/get_expenses');
    const result = await res.json();
    if (result.status !== 'success') return;

    const data = result.data || [];
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const viewMonthStr = `${year}-${(month + 1).toString().padStart(2, '0')}`;

    const budgetForMonth = Number(monthlyBudgets[viewMonthStr] || 0);
    const monthExpTotal = data.filter(e => e.expense_date.startsWith(viewMonthStr)).reduce((sum, e) => sum + Number(e.amount), 0);
    const remainingBudget = budgetForMonth - monthExpTotal;

    const remainingDisplay = document.getElementById('remainingDisplay');
    if (remainingDisplay) {
        remainingDisplay.innerText = `${remainingBudget.toLocaleString()}원`;
        remainingDisplay.style.color = remainingBudget < 0 ? '#e74c3c' : '#3498db';
    }

    document.getElementById('calTitle').innerText = `${year}년 ${(month + 1).toString().padStart(2, '0')}월`;
    const calGrid = document.getElementById('calGrid');
    calGrid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const dailyGoal = budgetForMonth > 0 ? budgetForMonth / lastDate : 0;

    for (let b = 0; b < firstDay; b++) {
        calGrid.appendChild(document.createElement('div')).className = 'cal-day';
    }

    for (let d = 1; d <= lastDate; d++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'cal-day';
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

        const dayExps = data.filter(e => e.expense_date === dateStr);
        const dayGeneralTotal = dayExps.reduce((sum, e) => sum + Number(e.amount), 0);
        const dayFixedExps = fixedExpenses.filter(f => f.fixed_date === dateStr);
        const dayFixedTotal = dayFixedExps.reduce((sum, f) => sum + Number(f.amount), 0);
        const totalDisplayAmt = dayGeneralTotal + dayFixedTotal;

        dayDiv.innerHTML = `<span class="day-num">${d}</span>`;
        if (totalDisplayAmt > 0) {
            let colorStyle = dayGeneralTotal <= dailyGoal ? "color: var(--success); font-weight: bold;" : "color: var(--danger); font-weight: bold;";
            dayDiv.innerHTML += `<div class="cal-amt" style="${colorStyle}">${totalDisplayAmt.toLocaleString()}</div>`;
            dayDiv.onclick = () => {
                document.getElementById('detailDate').innerText = `${dateStr} 내역`;
                const combinedDetail = [
                    ...dayExps.map(e => `<span>[${e.category}] ${e.description || '-'}</span><b>${Number(e.amount).toLocaleString()}원</b>`),
                    ...dayFixedExps.map(f => `<span style="color:var(--primary)">[고정] ${f.description}</span><b>${Number(f.amount).toLocaleString()}원</b>`)
                ];
                document.getElementById('detailList').innerHTML = combinedDetail.map(html => `<div class="list-item">${html}</div>`).join('');
                openModal('detailModal');
            };
        }
        calGrid.appendChild(dayDiv);
    }
}

// --- 통계 ---
async function renderChart() {
    const res = await fetch('/api/get_expenses');
    const result = await res.json();
    if (result.status !== 'success') return;

    const ctx = document.getElementById('chartCanvas').getContext('2d');
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const viewMonthStr = `${year}-${(month + 1).toString().padStart(2, '0')}`;

    const monthlyExps = (result.data || []).filter(e => e.expense_date.startsWith(viewMonthStr));
    const animal = getMonthlyAnimal(result.data || [], viewMonthStr);
    renderAnimalCard(animal);   
    let combinedData = monthlyExps.map(i => ({ category: i.category, amount: Number(i.amount) }));
    const monthlyFixed = fixedExpenses.filter(f => f.fixed_date.startsWith(viewMonthStr));
    monthlyFixed.forEach(f => combinedData.push({ category: '고정지출', amount: Number(f.amount) }));

    const cats = [...new Set(combinedData.map(i => i.category))];
    const totals = cats.map(c => combinedData.filter(i => i.category === c).reduce((sum, i) => sum + i.amount, 0));
    const totalSum = totals.reduce((a, b) => a + b, 0);

    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: cats, 
            datasets: [{ 
                data: totals, 
                backgroundColor: ['#3498db', '#2ecc71', '#e74c3c', '#f1c40f', '#9b59b6', '#1abc9c', '#34495e'] 
            }] 
        },
        plugins: [ChartDataLabels],
        options: { 
            plugins: { 
                datalabels: { 
                    color: '#fff', 
                    formatter: (v) => totalSum > 0 ? ((v / totalSum) * 100).toFixed(1) + '%' : '0%' 
                },
                legend: { position: 'bottom' }
            } 
        }
    });
}

// --- 저축 ---
async function loadGoal() {
    const resSav = await fetch('/api/get_savings');
    const resSum = await fetch('/api/get_expenses');

    const savData = (await resSav.json()).data || [];
    const expData = (await resSum.json()).data || [];

    const currentViewMonth = `${viewDate.getFullYear()}-${(viewDate.getMonth() + 1).toString().padStart(2, '0')}`;

    const budgetForMonth = monthlyBudgets[currentViewMonth] || 0;
    const monthExpenseTotal = expData
        .filter(e => e.expense_date.startsWith(currentViewMonth))
        .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalFixedForMonth = fixedExpenses
        .filter(f => f.fixed_date.startsWith(currentViewMonth))
        .reduce((sum, f) => sum + Number(f.amount), 0);

    const remainingBudget = budgetForMonth - monthExpenseTotal;

    const freeBalance = savData
        .filter(s => s.type === '자유')
        .reduce((sum, s) => sum + Number(s.amount), 0);

    const fixedDeposit = savData
        .filter(s => s.type === '고정' && Number(s.amount) > 0)
        .reduce((sum, s) => sum + Number(s.amount), 0);

    const withdrawTotal = savData
        .filter(s => Number(s.amount) < 0)
        .reduce((sum, s) => sum + Math.abs(Number(s.amount)), 0);

    const totalSavings = freeBalance + fixedDeposit;

    const statusCard = document.getElementById('statusCard');
    if (statusCard) {
        statusCard.innerHTML = `
            <h3>${currentViewMonth} 현황</h3>
            <p>💰 목표 예산: <b>${budgetForMonth.toLocaleString()}원</b></p>
            <p>📉 일반 지출: ${monthExpenseTotal.toLocaleString()}원</p> 
            <p>💡 남은 예산: <span style="color:${remainingBudget < 0 ? 'red' : 'blue'}">${remainingBudget.toLocaleString()}원</span></p>
            <p style="font-size:0.85rem; color:#888; margin-top: 5px;">(별도 고정 비용: ${totalFixedForMonth.toLocaleString()}원)</p>
            <hr>
            <p style="font-size:1.2rem; font-weight:bold; color:var(--primary); margin: 5px 0;">
                합계 잔액: ${totalSavings.toLocaleString()}원
            </p>
            <div style="display:flex; gap:10px; font-size:0.85rem; color:#666; margin-top:5px;">
                <span>🔓 자유: ${freeBalance.toLocaleString()}원</span>
                <span>🔒 고정: ${fixedDeposit.toLocaleString()}원</span>
                <span style="color:#e74c3c;">📤 인출: ${withdrawTotal.toLocaleString()}원</span>
            </div>
        `;
    }

    let html = `<h4 style="margin-top:20px;">저축 및 인출 기록</h4>`;
    if (savData.length === 0) {
        html += `<p style="color:gray;padding:10px;">기록이 없습니다.</p>`;
    } else {
        html += savData.map(s => {
            const amount = Number(s.amount);
            const isWithdraw = amount < 0;
            const label = isWithdraw ? `[${(s.description || '상세내역').replace('[인출]', '').trim()}] 인출` : `[${s.type === '고정' ? '고정' : '자유'}] 저축`;
            return `
                <div class="list-item">
                    <span>${isWithdraw ? '🔴' : '🔵'} ${label}</span>
                    <span>
                        <b style="color:${isWithdraw ? 'red' : 'black'}">${Math.abs(amount).toLocaleString()}원</b>
                        <button onclick="delSavings('${s.id}')" class="btn-delete-small">×</button>
                    </span>
                </div>`;
        }).join('');
    }
    document.getElementById('savListArea').innerHTML = html;
}

async function saveSavings() {
    const amount = document.getElementById('savAmt').value;
    const type = document.getElementById('savType').value;

    if (!amount || amount <= 0) return alert("금액을 정확히 입력하세요.");

    const res = await fetch('/api/add_savings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            amount: parseInt(amount), 
            type: type, 
            description: "저축" 
        })
    });

    const data = await res.json();
    if (data.status === 'success') {
        alert("저축되었습니다! 🐷");
        document.getElementById('savAmt').value = '';
        await loadGoal();
    } else {
        alert("저장 실패: " + data.message);
    }
}

async function withdrawSavings() {
    const amount = parseInt(document.getElementById('withdrawAmt').value);
    const desc = document.getElementById('withdrawDesc').value;
    if (!amount || amount <= 0) return alert("금액을 정확히 입력하세요.");
    if (!desc) return alert("인출 사유를 입력하세요.");

    const res = await fetch('/api/get_savings');
    const savData = (await res.json()).data || [];
    const freeBalance = savData.filter(s => s.type === '자유').reduce((a, b) => a + Number(b.amount), 0);

    if (amount > freeBalance) return alert(`잔액이 부족합니다! (현재 자유 저축 잔액: ${freeBalance.toLocaleString()}원)`);
    if (!confirm(`${amount.toLocaleString()}원을 인출하시겠습니까?`)) return;

    await fetch('/api/add_savings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: -amount, type: '자유', description: `[인출] ${desc}` })
    });

    alert("인출되었습니다.");
    document.getElementById('withdrawAmt').value = '';
    document.getElementById('withdrawDesc').value = '';
    await loadGoal();
}

async function delSavings(id) {
    if (!confirm("이 저축/인출 기록을 삭제하시겠습니까?")) return;
    await fetch('/api/delete_savings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    alert("삭제되었습니다.");
    await loadGoal();
}

function getMonthlyAnimal(expenses, monthStr){
    const cats = {
        '식비':0,
        '교통비':0,
        '주거/통신':0,
        '쇼핑/패션':0,
        '생활용품':0,
        '의료/건강':0,
        '여가생활':0,
        '자기계발':0,
        '기타':0
    };

    expenses.forEach(e=>{
        if(e.expense_date.startsWith(monthStr)){
            if(cats[e.category] != null){
                cats[e.category] += Number(e.amount);
            }
        }
    });

    cats['식비'] /= 2;

    const total = Object.values(cats).reduce((a,b)=>a+b,0);
    const isWin = value => value > (total-value);

    if(isWin(cats['식비'])){
        return {
            name:'야식 고양이',
            img:'/static/images/야식 고양이.png',
            msg:'식비 소비 비중이 가장 높습니다.'
        };
    }

    const rabbit =
        cats['쇼핑/패션'] +
        cats['여가생활'] +
        cats['교통비'];

    if(isWin(rabbit)){
        return {
            name:'탕진잼 토끼',
            img:'/static/images/탕진잼 토끼.png',
            msg:'쇼핑/여가/교통 소비가 큽니다.'
        };
    }

    const lion =
        cats['생활용품'] +
        cats['의료/건강'];

    if(isWin(lion)){
        return {
            name:'지름신 사자',
            img:'/static/images/지름신 사자.png',
            msg:'생활/건강 소비 비중이 높습니다.'
        };
    }

    const squirrel =
        cats['자기계발'] +
        cats['기타'] +
        cats['주거/통신'];

    if(isWin(squirrel)){
        return {
            name:'갓생 다람쥐',
            img:'/static/images/갓생 다람쥐.png',
            msg:'계획적이고 성장 중심 소비 패턴입니다.'
        };
    }

    return null;
}

function renderAnimalCard(animal){
    const box = document.getElementById('animalCard');
    if(!box) return;
    if(!animal){ box.style.display='none'; return; }
    box.style.display='block';
    box.innerHTML = `
        <div class="animal-box">
            <img src="${animal.img}">
            <div class="animal-info">
                <h3>🐾 이번 달 소비 유형 : ${animal.name}</h3>
                <p>${animal.msg}</p>
            </div>
        </div>
    `;
}