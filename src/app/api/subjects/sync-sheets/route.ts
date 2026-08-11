import { NextResponse } from "next/server";
import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";

// fep-subjects doubles as storage for the saved program archive (see
// archive/route.ts) — never delete that row when rebuilding subjects.
const ARCHIVE_PK = "fep-program-archive";
import { getCurrentUser } from "@/lib/auth";

// Raw data fallback if no Google Sheet is loaded
const RAW_DATA = `Name 	Contact Number	Email Id 	Subject You Want To Teach ?	Vertical You Want To Teach ?
Rana Mrituanjay Singh 	9935177381	ranamrityunjay2015@gmail.com	History 	SSC
Mayank Kumar 	9140582792	mayankpathak0098@gmail.com	Maths	Foundation
Prem Raj 	8709131540	prempipul7209@gmail.com	Biology 	Neet
Alok gautam 	6306213359	aggautam93@gmail.com	English 	Foundation 
Sandeep kumar	7011329909	sksandeepraj936@gmail.com	Reasoning 	SSC
Lalit Yadav 	7668750481	lalityadav377433@gmail.com	Economy 	Ssc
Vishesh Verma 	8957885514	visheshverma2002real@gmail.com	Maths 	Foundation
Durga Tripathi 	7974585746	Durgatripathi092@gmail.com	Biology 	Teaching 
Parthavi Dhawan	8178887646	parthavidhawan29@gmail.com	Mathematics 	Foundation 
Piyush kumar singh 	7985114398	pksraghuvanshi18@gmail.com	Gs	Upsc 
Gyanendra Tiwari 	9289597892	Enlightengyan@gmail.com	Polity 	Upsc/state pcs
Amresh Kumar Sinha 	6202246044	asinhabgp@gmail.com	History and bihar special 	Bpsc,ssc
MITHUN KUMAR	9598946244	mithunkumar46173@gmail.com	Geography 	Geography 
Shubham gupta 	8077170988	guptashubham0093@gmail.com	Maths	SSC
Ram vibhor mishra	9559984830	ramvibhor060@gmail.com	History	UGC
Abhishek Kumar 	8506014748	abchauhan0802@gmail.com	Quantitative Aptitude 	Banking 
SHASHI KUMAR SAH 	9122634241	shashismo91@gmail.com	Maths	SSC
Sandeep Verma 	9162876007	Sv3274821@gmail.com	Political science 	K12
Chandan Pandey	9628931110	cpandey414@gmail.com	Geography	UGC - NET 
Tejus Soni 	9587280859	tejussoni91@gmail.com	Current Affairs	Civil Services Exams
Shivangi Sonkar 	7985334252	shivangi915sonkar@gmail.com	Biology 	K12
Brijesh Kumar 	9235193962	brijeshsir2959@gmail.com	Geography 	UPPSC
Anshu Kumar 	9304385258	anshuking93043@gmail.com	Maths	K12
Shubham Srivastava 	6306322361	shubhamsrivastava0022@gmail.com	Maths	Foundation
Uttam Singh 	9758580899	raghavuttam2111@gmail.com	GS	SSC
ADARSH BODANA	8302452605	adarshbodana85@gmail.com	Geography	UGC NET 
Anamika agrahari 	9140792851	anamikaanamikaagrahari62038@gmail.com	History 	UPSSSC / PCS
Shivendra Singh 	9793500617	shivendra9793500617@gmail.com	Maths 	SSC
GANESH CHANDRA CHAURASIYA	8787293330	bindassgcc@gmail.com	Biology	SSC
Deepak Sonu (Deepak Kumar)	7700820385	sonud9125@gmail.com	Maths 	SSC
Pooja Kumari 	9818915043	poojakumari01201997@gmail.com	English 	Foundation
Numan Shahabuddin 	9235835166	haanclasses@gmail.com	Maths	Foundation
Divyanshu tiwari 	9173470937	tiwaridivynshu@gmail.com	Reasoning 	SSC
Sunny Rai	9939715929	raisunny524@gmail.com	Geography 	SSC
Saurabh Kumar Dwivedi	7007424399	shubh29d@gmail.com	Maths	Teaching
Suryakant Singh	9452792871	drsurya2016@gmail.com	Biology	K12
Sagar	7828549239	sagarpatva1007@gmail.com	Zoology and botany	K12
Raj kumar Raju 	9065965757	16btag115@gmail.com	Biology 	Foundation 
Namrata Mishra 	8917088384	namratamishra232@gmail.com	Political Science/Civics	CUET PG
Md sarfraj ali 	9631928426	mdsarfrajali02@gmail.com	Geography 	K12
Anoop Patel 	7618898781	ap2320575@gmail.com	History 	Teaching
Milan Kumar 	8447354135	milankumar008@gmail.com	Political science, History Geography and Current Affairs 	K12
Vandana Singhal	6398214814	vandanasinghal1811@gmail.com	Maths	Foundation
Sambhu Kumar	8292522520	sambhukumar971@gmail.com	Maths	Foundation
Ravendra verma 	7974402952	ravendraverma1995@gmail.com	Building material & Construction 	Engineering 
SACHIN SRIVASTAVA 	8299016930	sachinsrivastava1160@gmail.com	History 	Foundation 
Devendra Singh 	9559474329	nedevendra95@gmail.Com	Chemistry 	Foundation +k12
Numan Shahabuddin 	9235835166	haanclasses@gmail.com	Maths	foundation
Shivanand Yadav 	9795224657	rajababushiva70@gmail.com	Maths 	 Foundation ,SSC ,  Teaching 
Ved Prakash Bais	6393450386	vedpbais2708@gmail.com	History 	teaching, UGC NET 
Yash Prajapati	7267932323	yash.praj2000@gmail.com	Computer	ADDA247 ITI
Sonam Kumari 	6200384801	sonam620038@gmail.com	Geography and polity 	SSC 
Danish Hussain	8287752923	danishhussain653@gmail.com	REASONING 	SSC 
Aditya Kumar 	9006762842	vanijya.aditya@gmail.com	Accountancy 	K 12 Integrated 
Dinesh kumar yadav 	9161652812	dky3805@gmail.com	Science 	SSC
Madhu shakya	6397027680	Madhu.madhushakya@gmail.com	Mathematics 	Ssc cgl
Shoaib Khan 	9340981449	ershoaib59@kgpian.iitkgp.ac.in	Mechanical Engineering (Thermal, Fluid, Design and Manufacturing)	GATE, SSC ,Engineer 
Deepak Kumar Dubey 	7838505185	deepak7838505185@gmail.com	Current affairs, Geography 	PCS
ANIL KUMAR 	8534000975	anilku1094@gmail.com	Mathematics 	SSC 
Neha goel	8447186352	nehagoel030@gmail.com	Reasoning 	SSC
Kajal	8851126419	k661kajal@gmail.com	CDP (Child development and Pedagogy)	Teaching exams
Tripti 	8057635332	triptimanjera8nov@gmail.com	Mathematics 	K12
Shubham Kumar maurya	7704837523	stmusk1221@gmail.com	By adda247 youtube channel	Academics
Ashutosh Srivastava 	7985216985	ashu14june@gmail.com	Indian Polity and Modern History 	PCS 
Shraddha Sharma 	8840371565	shraddhaSharma8840@gmail.com	Child development and pedagogy (CDP)	Teaching
Ashish kumar saxena 	7080806134	ash	Geography 	Teaching 
AKASH PANDEY	9140683075	pandeyakash546@gmail.com	English  literature and grammar and social science	foundation
Priya gupta 	7704030689	Pgupta888@gmail.com	Biology (Botany and zoology)	Academic (Class 9th and 10th)
NITESH KUMAR	9534065435	niteshwrites09@gmail.com	ENGLISH	SSC / BANK 
Astha singh	7752825471	asthasingh12210@gmail.com	History, current affairs 	Ssc
Akansha mishra	9616608950	mishraakansha2204@gmail.com	Reasoning 	Banking
Tulsi Singh	9555741181	kanttulsi03@gmail.com	All Nursing Subjects	Nursing  
Vaishali Dixit	8299471880	vaishaleedixit911@gmail.com	Current affairs-IR	PCS
Hansraj Meena 	78794 51250 	hansraj7879451250@gmail.com	Maths / Reasoning 	SSC
Anshuman	9717249886	anshuman.kumarr@gmail.com	Geography	Teaching Exams
Damini Singh 	8881034410	daminijnp01@gmail.com	Reasoning 	Ssc
Namrata Mishra 	8917088384	namratamishra232@gmail.com	Political Science / Civics	K12
Sumit	906819175	sumitmunjal63@gmail.com	Mathematics 	Teaching Exams
Rakesh Kumar Yadav	9807385434	rakeshyadavme@gmail.com	TOM, RAC, HMT ICE	Engineering (Mechanical Engineering)
Akanksha Kumari 	9472896045	akankshakumari582003@gmail.com	Sociology 	K12,K13
Rajni Devi 	6393602973	vermarajni03558@gmail.com	Hindi vyakaran 	K12
RAHUL UPADHYAY 	6397251799	rs9702761@gmail.com	Mathematics 	Foundation
Rishabh raja	9305229840	rishabhrajadj1234@gmail.com	GS 	SSC
Akanksha Kumari 	9472896045	akankshakumari582003@gmail.com	Sociology 	FOUNDATION ,K12
Divaroopa Mishra	9557682236	mishradiva2024@gmail.com	computer 	SSC,CUET,UGC
Aniruddh sharma 	9305115362	rahulpandit67023@gmail.com	Maths 	Foundation
Ansh Dham	9897021641	anshdham04@gmail.com	Physics	JEE/NEET
ROHIT YADAV 	9134062670	rkumarsc163@gmail.com	Mathematics 	foundation
Deepak Kumar 	9798882457	deepakkumar01052005@gmail.com	Science (physics, chemistry)	Foundation 
Tezender Gulia 	8696431618	tezendergulia93@gmail.com	Political Science	CUET PG
Anas Rasheed	9506480698	rasheedanas515@gmail.com	Reasoning	SSC
Anubhav singh	8299338171	001anubhavthakur0@gmail.com	History and polity	SSC and defence 
Mahendra Nagar 	8770232537	mahennagar11@gmail.com	Physics 	K12,NEET
SONAM KUMARI	6200384801	sonam620038@gmail.com	Geography and polity 	SSC 
Shubham Pandey 	6392683465	pandeygsibbu@gmail.com	CDP and Social studies 	Teaching exams 
Mohammad Shahnawaz 	9634193607	shahnawazmaulvi@gmail.com	Urdu, Arabic	K12,K13
GANESH CHANDRA CHAURASIYA	8787293330	bindassgcc@gmail.com	Biology	Foundation,k12
Anshuman	9717249886	Anshuman 	Geography 	Ugc Net CTET/STET
Mahendra Nagar 	8770232537	mahennagar11@gmail.com	Physics 	k12,NEET
Akanksha Ray 	9937231838	akanksharay03@gmail.com	Reasoning 	Banking 
Prutha Saha 	6305448345	pruthasaha09@gmail.com	Biology 	Foundation,NEET
Dr. Vinodinee Dubey 	7415012477	vinodinee26@gmail.com	Zoology 	NEET
Shubham kushwaha 	9630700101	shubhamkushwaha629@gmail.com	Sociology 	UGC NET
Swadeep Shrivastava 	7999635417	swadeepshri@gmail.com	Geography and Madhya pradesh state special 	PCS
Shreya Trivedi 	8004489477	mishitri7071@gmail.com	Science 	Teaching
Rishika Mishra 	9608842014	mishra.rishika029@gmail.com	Business studies 	K12
Surbhi	9953079307	surbhijindal1311@gmail.com	Quantitative Aptitude 	K12,K13
Anupama singh 	9540393168	Singhanupama517@gmail.com	Political science 	k12
Sufia Naz 	8789446880	hayatnaz222@gmail.com	Physics 	 SSC 
POOJA AGARWAL	7878806140	PROBANKERSINSIGHTS@GMAIL.COM	REASONING	Banking
Priyanka Verma 	9518176133	pv955929@gmail.com	Biology 	k12,NEET
Rupesh Kumar 	72093242524	rupeshkumar.adv23@gmail.com	Indian Polity and Constitution/Jharkhand 	PCS,UPSC
Tanishq Shukla 	7394838672	tanishqshukla572@gmail.com	Biology 	NEET 
Prachi choudhary	8770914636	Cdeep1890@gmail.com	Gk 	Ssc
Radha Tamoli 	7895093044	radharawat0156@gmail.com	Polity 	FOUNDATION,K12
Sanchita Kumari 	9572923483	kumarisanchita67@gmail.com	General Awareness 	Banking exams 
Gurinder Singh 	7707995131	gurindersingh2185@gmail.com	Mathematics 	K12
RIPUDAMAN SINGH 	9580229042	ripukbc2018@gmail.com	Mathematics 	SSC 
RAHUL RAVIRAJ	9386318074	er.rahulraviraj@gmail.com	Mathematics 	FOUNDATION
Rohit	9555743915 & 9971077168	rohitkhatri0209@gmail.com	English	DSSSB , SSC
RAHUL RAVIRAJ	9386318074	er.rahulraviraj@gmail.com	Mathematics 	FOUNDATION
Vatsal Bhardwaj	9928122841	bharadwajvatsal@gmail.com	GS(Polity)	SSC
Manjunath Bharadwaj B S 	8880652666	manjunathbharadwaj91@gmail.com	For Grade 8 to 10 (Maths, Chemistry, Physics) for Grade 11 and 12 Chemistry	NEET, TEACHING,FOUNDATION
Prutha Saha 	6305448345	pruthasaha09@gmail.com	Biology	FOUNDATION,K12,SSC
PRAMILA YADAV	7419027079	Pramilayaduvanshi0@gmail.com	Child development and pedagogy 	TEACHING
Himanshi 	7988057414	phalswal2509@gmail.com	Chemistry 	K12,NEET
Rajan	9213403071	9213403071r@gmail.com	Sociology, political science, indian society and social justice 	UPSC ,PCS
Poonam Tiwari	9004651427	poonamtiwari3030@gmail.com	Hindi 	Teaching
Neha Singh 	8982464528	singhnehaa478@gmail.com	GS & Current Affairs 	Ssc
SWATI CHAUHAN 	8750024244	Vyasswati0811@gmail.com 	Social science 	Foundation
Shubham kushwaha 	9630700101	shubhamkushwaha629@gmail.com	Sociology 	UGC NET 
Anshuman	9717249886	anshuman.kumarr@gmail.com	SST  and Geography 	k12,teaching
Rakesh Kumar Yadav	9807385434	rakeshyadavme@gmail.com	TOM, RAC, HMT, ICE, MD, IE,	Engineering (Mechanical Engineering)
Shivam singh	9621266246	Shivamchauhan0380@gmail.com	Geography	SSC 
Shivam Rishav 	7088712709	shivam.rishav1998@gmail.com	Current Affairs including PIB, RBI etc	Banking, SSC, PCS
Ashish Kumar 	8368703609	ak527524@gmail.com	Mathematics 	FOUNDATION
Vipin Yadav 	8534854926	vy607092@gmail.com	GS and Science for SSC , STATE PSC AND UPSC 	SSC,PCS,UPSC
RAJESH KUMAR PAL	7275968354	rajeshpal2985@gmail.com	POLITICAL SCIENCE	UGC NET-JRF
Himanshu Mishra	6386524141	himanshusagar378@gmail.com	Quantitative Aptitude	SSC
Harpreet kaur 	8278789216	harpreetkaurpmkk@gmail.com	Mathematics 	FOUNDATION
Harshita pathak 	9369547481	pathakchinki3@gmail.com	science 	Foundation ,K12
Meenakshi lohani 	8077278361	lohanimeenakshi@gmail.com	Polity and Governance 	STATE PCS
Ved Prakash Bais 	6393450386	vedpbais2708@gmail.com	History 	Ugc net ,pgt
Rishabh raja	9305229840	rishabhrajadj1234@gmail.com	G.S.	SSC
Tikesh Patel 	7692822529	tikesh961725@gmail.com	Biology (Zoology )	NEET
Altaf Raja 	6200100760	kohifacto@gmail.com	Current affairs with static gk/ gs , polity & map  and bihar special 	PCS
Namrata Mishra 	8917088384	namratamishra232@gmail.com	Political Science 	K13
Amit kumar Verma	8577821838	amitv9503@gmail.com	English Literture	UGC NET,K12,
Ved Prakash Bais 	6393450386	vedpbais2708@gmail.com	History 	Ugc net ,pgt
Tamana Kumari 	7701800536	tamannakumari9911@gmail.com	CDP	Teaching Exam 
Piyush sanjay jaiswal	7030332009	jaiswalpiyush7030@gmail.com	Biology 	Biology
Anish sinha	7828139367	anishissinha@gmail.com	SCIENCE , COMPUTER , CHHATTISGARH GK	SSC 
Vikhyat Mishra 	7408726445	19vikh@gmail.com	English (Grammar)	Yes
Rana Mrituanjay Singh 	9140965097	ranamrityunjay2015@gmail.com	GS ( specifically History)	SSC
Akanksha Ray 	9937231838	akanksharay03@gmail.com	Reasoning 	Banking 
Shubham Srivastava 	6306322361	shubhamsrivastava0022@gmail.com	Maths	foundation
ANIL KUMAR 	8534000975	anilku1094@gmail.com	Mathematics 	SSC 
Lalit Yadav 	7668750481	lalityadav377433@gmail.com	Economy and polity 	Ssc 
MANISH KUMAR 	6388335466	mnisk98@gmail.com	THERMODYNAMICS AND APPLIED 	SSC
SIMRAN 	8882461761 / 8750116011	themalikofficialy@gmail.com	Library Science 	Ugc net / DSSSB 
Rupesh Kumar	7209324524	rupeshkumar.adv23@gmail.com	Indian Polity and Constitution 	UPSC,PCS
Ranjan kumar 	9709752526	ranjaan58@gmail.com	Maths 	PCS,Teaching
Akanksha	8528742590	Devnampriya767@gmail.com	Current affairs   the hindu analysis  indian express	UPSC
Harsh Kumar 	9758721304	harshu790064@gmail.com	English 	SSC 
Neha Khurana	7042550954	contactneha30@gmail.com	 Logical Reasoning 	UGC NET 
Ishan Sharma	8871294239	ishan891996sharma@gmail.com	Chemistry 	K12,NEET
Ashish kumar saxena 	7080806134	ashish.surfer20@gmail.com	Geography 	Teaching 
Zainab Fatima 	9569434770	Zainabfatimaansari350@gmail.com	Psychology 	K12
Nitika Mishra 	8955962723	Nitikamishra441@gmail.com	Humanities	Foundations 
Sandeep verma 	9162876007	sv3274821@gmail.com	Political science 	K12,K13
Devendra Singh 	9559474329	nedevendra95@gmail.Com	Chemistry 	K12
Krishna Rajput 	9861055810	kanhiyalodhi657@gmail.com	Reasoning 	Ssc 
Ankit pal	9250202065	palankit253@gmail.com	Mathematics	Teaching
Sumedha Trivedi	9457027231	trivedisumedha24@gmail.com	Political science	UGC NET
Neha goel	8447186352	nehagoel030@gmail.com	Reasoning 	SSC
Sujoy Modak 	8016286777	sujoymodak58@gmail.com	Mathmatics	Railway and State Level Exam. (Teach In Bengali language)
Ravindra Singh Deval 	8739983647	ravindradeval@gmail.com	Indian polity, Rajasthan history and culture,class 11,12 political science 	Teaching exam,RPSC,,
Anshuman	9717249886	anshuman.kumarr@gmail.com	Geography 	Competition graduation based and 12 boards 
Mrityunjay kumar Gupta 	9313219277	believeornoton@gmail.com	Geography /current Affairs 	Psc/upsc
Monika	8929254598	monikadhankar1999@gmail.com	Mathematics 	Banking 
Chandra Prakash Gupta 	9139645707	chandraprakashg535@gmail.com	Gk/GS	UP State Exams
Chandan Pandey	9628931110	cpandey414@gmail.com	Geography	UGC- NET
Ankit Pal	9250202065	palankit253@gmail.com	Mathematics	Teaching exam
CHANDAN PANDEY	9628931110	cpandey414@gmail.com	Geography	UGC - NET
Krishna Kumar Yadav 	7903489984	kyadav42117@gmail.com	Mathematics 	LIKE S.S.C.(C.G.L.,C.H.S.L.,M.T.S.,D.P.,G.D. etc.)
Krishna Kumar Yadav 	7903489984	kyadav42117@gmail.com	Mathematics 	S.S.C.(C.g.l.,c.h.s.l.,c.p.o.,d.p.,m.t.s., etc.), Banking etc.
Pushpendra Saini	7891981055	pushpendrasaini13@gmail.com	Biology	NEET`;

export function refineSubjectAndVertical(rawSub: string, rawVert: string): { name: string; subjectId: string; verticalId: string } {
  // 1. Resolve vertical strictly
  const vertClean = rawVert.replace(/\s+/g, " ").trim().toLowerCase();
  let vertId = vertClean.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  if (vertId.includes("ssc")) vertId = "ssc";
  else if (vertId.includes("foundation")) vertId = "foundation";
  else if (vertId.includes("neet")) vertId = "neet";
  else if (vertId.includes("nursing")) vertId = "nursing";
  else if (vertId.includes("teaching") || vertId.includes("tet") || vertId.includes("cdp")) vertId = "teaching";
  else if (vertId.includes("upsc") || vertId.includes("pcs") || vertId.includes("bpsc") || vertId.includes("civil") || vertId.includes("state-exam")) vertId = "upsc";
  else if (vertId.includes("banking") || vertId.includes("bank")) vertId = "banking";
  else if (vertId.includes("ugc") || vertId.includes("net")) vertId = "ugc-net";
  else if (vertId.includes("cuet")) vertId = "cuet";
  else if (vertId.includes("railway") || vertId.includes("rrb")) vertId = "railway";
  else if (vertId.includes("gate") || vertId.includes("engineer") || vertId.includes("tech") || vertId.includes("iti") || vertId.includes("engineering")) vertId = "tech";
  else if (vertId.includes("k12") || vertId.includes("k13") || vertId.includes("k-12") || vertId.includes("academic") || vertId.includes("yes") || vertId.includes("geography") || vertId.includes("biology") || vertId.includes("humanities")) vertId = "foundation";
  else {
    vertId = "foundation";
  }

  // 2. Normalize subject name
  const subClean = rawSub.trim().replace(/\s+/g, " ").toLowerCase();
  let normName = "";

  if (subClean.includes("history") && subClean.includes("bihar")) {
    normName = "History & Bihar Special";
  } else if (subClean.includes("history")) {
    normName = "History";
  } else if (subClean.includes("maths / reasoning")) {
    normName = "Mathematics & Reasoning";
  } else if (subClean.includes("math") || subClean.includes("quant") || subClean.includes("arithmetic")) {
    normName = "Mathematics";
  } else if (subClean.includes("zoology") && subClean.includes("botany")) {
    normName = "Biology (Zoology & Botany)";
  } else if (subClean.includes("zoology")) {
    normName = "Zoology";
  } else if (subClean.includes("biology") && subClean.includes("botany")) {
    normName = "Biology (Botany)";
  } else if (subClean.includes("biology")) {
    normName = "Biology";
  } else if (subClean.includes("english")) {
    normName = "English";
  } else if (subClean.includes("reasoning")) {
    normName = "Reasoning";
  } else if (subClean.includes("economy") || subClean.includes("economics")) {
    normName = "Economics";
  } else if (subClean.includes("political science") || subClean.includes("polity") || subClean.includes("civics")) {
    normName = "Polity & Political Science";
  } else if (subClean.includes("geography")) {
    normName = "Geography";
  } else if (subClean.includes("current affairs") || subClean.includes("general awareness") || subClean.includes("gk") || subClean.includes("gs")) {
    normName = "Current Affairs & GK";
  } else if (subClean.includes("cdp") || subClean.includes("pedagogy") || subClean.includes("child development")) {
    normName = "Child Development & Pedagogy (CDP)";
  } else if (subClean.includes("physics")) {
    normName = "Physics";
  } else if (subClean.includes("chemistry")) {
    normName = "Chemistry";
  } else if (subClean.includes("science")) {
    normName = "Science";
  } else if (subClean.includes("computer")) {
    normName = "Computer Science";
  } else if (subClean.includes("building material") || subClean.includes("construction") || subClean.includes("civil")) {
    normName = "Civil Engineering";
  } else if (subClean.includes("mechanical") || subClean.includes("thermodynamics") || subClean.includes("tom") || subClean.includes("hmt")) {
    normName = "Mechanical Engineering";
  } else if (subClean.includes("sociology")) {
    normName = "Sociology";
  } else if (subClean.includes("nursing")) {
    normName = "Nursing";
  } else if (subClean.includes("hindi")) {
    normName = "Hindi";
  } else if (subClean.includes("urdu") || subClean.includes("arabic")) {
    normName = "Urdu & Arabic";
  } else if (subClean.includes("library science")) {
    normName = "Library Science";
  } else if (subClean.includes("accountancy") || subClean.includes("business studies") || subClean.includes("commerce")) {
    normName = "Commerce & Accountancy";
  } else {
    const words = rawSub.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    normName = words.join(" ");
  }

  const baseId = normName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const subjectId = `${baseId}-${vertId}`;

  return { name: normName, subjectId, verticalId: vertId };
}

function parseRawData(text: string) {
  const lines = text.trim().split("\n");
  const subjectsMap = new Map<string, { name: string; verticalId: string }>(); // subjectId -> info
  const verticalsSet = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t").map(c => c.trim());
    if (cols.length < 5) continue;
    const rawSub = cols[3];
    const rawVert = cols[4];
    if (!rawSub || !rawVert) continue;

    const refined = refineSubjectAndVertical(rawSub, rawVert);
    subjectsMap.set(refined.subjectId, { name: refined.name, verticalId: refined.verticalId });
    verticalsSet.add(refined.verticalId);
  }

  return { subjectsMap, verticalsSet };
}


export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "eduskill_manager" && user.role !== "eduskill_admin")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sheetUrl = searchParams.get("url");

  let subjectsMap = new Map<string, { name: string; verticalId: string }>();
  let count = 0;

  try {
    if (sheetUrl && sheetUrl.startsWith("http")) {
      const res = await fetch(sheetUrl);
      if (res.ok) {
        const text = await res.text();
        const parsed = parseRawData(text);
        subjectsMap = parsed.subjectsMap;
      }
    }
  } catch (err) {
    console.error("Failed to parse remote Google Sheet, falling back to local dataset", err);
  }

  if (subjectsMap.size === 0) {
    const parsed = parseRawData(RAW_DATA);
    subjectsMap = parsed.subjectsMap;
  }

  // Clear current subjects table and rebuild it dynamically — but never
  // touch the saved program archive row that shares this table.
  const existingItems = await scanAll({ TableName: TABLES.SUBJECTS });
  for (const item of existingItems) {
    if (item.subjectId === ARCHIVE_PK) continue;
    await ddb.send(new DeleteCommand({ TableName: TABLES.SUBJECTS, Key: { subjectId: item.subjectId } }));
  }

  // Populate dynamic subjects
  for (const [subjId, info] of subjectsMap.entries()) {
    await ddb.send(
      new PutCommand({
        TableName: TABLES.SUBJECTS,
        Item: {
          subjectId: subjId,
          name: info.name,
          verticalId: info.verticalId,
          description: `Automatically extracted teaching subject for ${info.verticalId.toUpperCase()}`
        }
      })
    );
    count++;
  }

  return NextResponse.json({ success: true, count, message: `Successfully synced ${count} subjects from Google Sheets data.` });
}

